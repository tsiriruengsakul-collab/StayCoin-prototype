import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "mocha";
import { network } from "hardhat";
import { Interface, parseEther, ZeroAddress } from "ethers";
import {
  bookingDate, buyPrimaryNight, buyResaleNight, canBuyNight, canResell, dateKey, DAY, errorText, futureStayDate,
  marketplace, nightTokenAbi, priceInWei, readBookingHistory, readMarket, verifyNightTokenV2,
} from "../src/chain.js";

const source = "contracts/StayCoinNightTokenV2.sol:StayCoinNightTokenV2";
const original = "contracts/remix/StayCoinNightTokenV2.sol:StayCoinNightTokenV2";
const primary = parseEther("0.001");
const resale = parseEther("0.0015");

describe("Frontend adapter for the patched Night Token V2", function () {
  let connection: Awaited<ReturnType<typeof network.create>>;
  beforeEach(async () => { connection = await network.create(); });
  afterEach(async () => connection.close());

  it("accepts the artifact selected for Remix and rejects an empty address and both older implementations", async () => {
    const { ethers } = connection;
    const [owner, unused] = await ethers.getSigners();
    const v2 = await ethers.deployContract(source);
    const olderUpload = await ethers.deployContract(original);
    const olderMarketplace = await ethers.deployContract("StayCoinNightToken");
    const block = await ethers.provider.getBlockNumber();
    const verified = await verifyNightTokenV2(ethers.provider, await v2.getAddress(), block);
    assert.equal(await verified.owner(), owner.address);
    assert.equal(new Interface(nightTokenAbi).formatJson(), v2.interface.formatJson());
    await assert.rejects(verifyNightTokenV2(ethers.provider, unused.address, block), /No contract is deployed/);
    await assert.rejects(verifyNightTokenV2(ethers.provider, await olderUpload.getAddress(), block), /not the tested/);
    await assert.rejects(verifyNightTokenV2(ethers.provider, await olderMarketplace.getAddress(), block), /not the tested/);
  });

  it("uses the Bangkok calendar regardless of browser timezone and validates dates and wei", () => {
    assert.equal(bookingDate("2026-11-25"), BigInt(Date.parse("2026-11-24T17:00:00Z") / 1000));
    assert.equal(dateKey(bookingDate("2026-11-25")), "2026-11-25");
    assert.throws(() => bookingDate("2026-02-30"), /valid Bangkok calendar date/);
    assert.throws(() => futureStayDate("2026-11-25", bookingDate("2026-11-25")), /after today/);
    assert.equal(priceInWei("0.0015"), resale);
    assert.throws(() => priceInWei("1e-3"), /18 decimal places/);
    assert.throws(() => priceInWei("0"), /greater than zero/);
    assert.match(errorText({ reason: "Outside check-in day" }), /Bangkok stay date/);
    assert.match(errorText({ code: "ACTION_REJECTED" }), /declined/);
  });

  it("reads, pays, resells, burns, settles, and withdraws through the ABI used in the website", async () => {
    const { ethers } = connection;
    const [owner, hotel, traveler, buyer] = await ethers.getSigners();
    const deployed = await ethers.deployContract(source);
    const address = await deployed.getAddress();
    const deployment = await deployed.deploymentTransaction()?.wait();
    assert.ok(deployment);
    const ownerContract = marketplace(owner, address);
    const hotelContract = marketplace(hotel, address);
    const travelerContract = marketplace(traveler, address);
    const buyerContract = marketplace(buyer, address);
    const snapshot = async (account: string) => {
      const block = await ethers.provider.getBlock("latest");
      assert.ok(block);
      return { ...(await readMarket(ownerContract, account, block.number, BigInt(block.timestamp))),
        time: BigInt(block.timestamp), block: block.number };
    };
    const advance = async (timestamp: bigint) => {
      await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
      await ethers.provider.send("evm_mine", []);
    };

    await (await ownerContract.registerHotel(hotel.address, 60n)).wait();
    const { time, hotel: approved } = await snapshot(hotel.address);
    assert.equal(approved?.approved, true);
    assert.equal(approved.verifiedRooms, 60n);
    const date = futureStayDate(dateKey(time + 2n * DAY), time);
    await (await hotelContract.createNight(date, approved.verifiedRooms, primary)).wait();
    await (await hotelContract.createNight(date, approved.verifiedRooms, primary)).wait();
    const available = await snapshot(traveler.address);
    assert.ok(canBuyNight(available.nights[0], available.time));
    const purchase = await buyPrimaryNight(travelerContract, 1);
    assert.equal(purchase.value, primary);
    assert.equal((await purchase.wait()).status, 1);
    await (await buyPrimaryNight(travelerContract, 2)).wait();
    assert.equal((await snapshot(traveler.address)).nights[0].holder, traveler.address);
    await (await travelerContract.listForResale(1, resale)).wait();
    const listing = (await snapshot(buyer.address)).nights[0];
    assert.deepEqual(listing.quote, { seller: parseEther("0.00133"), hotel: parseEther("0.000125"), platform: parseEther("0.000045") });
    await (await travelerContract.cancelListing(1)).wait();
    await assert.rejects(buyResaleNight(buyerContract, listing), /listing changed/);
    await (await travelerContract.listForResale(1, resale + 1n)).wait();
    await assert.rejects(buyResaleNight(buyerContract, listing), /listing changed/);
    await (await travelerContract.listForResale(1, resale)).wait();
    const takeOver = await buyResaleNight(buyerContract, listing);
    assert.equal(takeOver.value, resale);
    assert.equal((await takeOver.wait()).status, 1);
    const transferred = await snapshot(buyer.address);
    assert.equal(transferred.nights[0].holder, buyer.address);
    assert.equal(transferred.nights[0].quote, null);
    const resaleHistory = await readBookingHistory(ownerContract, deployment.blockNumber, transferred.block);
    assert.deepEqual(resaleHistory.resales.get(1), { sales: 1n, volume: resale });

    await advance(date);
    assert.ok(!canResell(transferred.nights[0], date));
    await (await hotelContract.checkIn(1, buyer.address)).wait();
    const checkedIn = await snapshot(buyer.address);
    assert.equal(checkedIn.nights[0].holder, ZeroAddress);
    assert.equal(checkedIn.nights[0].redeemed, true);
    assert.equal(checkedIn.nights[0].bond, 0n);
    assert.equal(await hotelContract.balanceOf(buyer.address, 1), 0n);
    assert.equal((await snapshot(hotel.address)).proceeds, parseEther("0.001925"));

    await advance(date + DAY);
    await (await travelerContract.expireNight(2)).wait();
    const expired = (await snapshot(traveler.address)).nights[1];
    assert.equal(expired.expiredHolder, traveler.address);
    await (await ownerContract.settleExpiredBond(2, expired.expiredHolder)).wait();
    const settled = await snapshot(traveler.address);
    assert.equal(settled.nights[1].bond, 0n);
    assert.equal(settled.proceeds, parseEther("0.00143"));
    const history = await readBookingHistory(ownerContract, deployment.blockNumber, settled.block, resaleHistory);
    assert.equal(history.checkedIn.get(1), buyer.address);
    assert.deepEqual(history.settlements.get(2), { recipient: traveler.address, amount: parseEther("0.0001") });
    assert.deepEqual(history.resales.get(1), { sales: 1n, volume: resale });

    for (const wallet of [ownerContract, hotelContract, travelerContract]) {
      await (await wallet.withdraw()).wait();
    }
    assert.equal(await ethers.provider.getBalance(address), 0n);
    assert.equal((await snapshot(traveler.address)).proceeds, 0n);
  });
});
