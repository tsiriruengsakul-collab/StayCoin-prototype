import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "mocha";
import { Contract, ZeroAddress, parseEther, AbiCoder, keccak256, type ContractTransactionResponse } from "ethers";
import { network } from "hardhat";

const originalSource = "contracts/remix/StayCoinNightTokenV2.sol:StayCoinNightTokenV2";
const patchedSource = "contracts/StayCoinNightTokenV2.sol:StayCoinNightTokenV2";

const primaryPrice = parseEther("0.001");
const resalePrice = parseEther("0.0015");
const primaryFee = parseEther("0.00005");
const originalBond = parseEther("0.0001");
const hotelPrimary = parseEther("0.00085");
const resaleFee = parseEther("0.000045");
const resaleHotelShare = parseEther("0.000125");
const resaleSellerAmount = parseEther("0.00133");
const rooms = 60n;
const day = 86_400;
const bangkokOffset = 7 * 3600;

type Connection = Awaited<ReturnType<typeof network.create>>;
async function deploy(connection: Connection, source: string) {
  const { ethers } = connection;
  const [owner, hotel, firstTraveler, resaleBuyer] = await ethers.getSigners();
  const deployed = await ethers.deployContract(source, owner);
  await deployed.waitForDeployment();
  const address = await deployed.getAddress();
  const booking = new Contract(address, deployed.interface, owner);
  const block = await ethers.provider.getBlock("latest");
  assert.ok(block);
  const stayDate = (Math.floor((block.timestamp + bangkokOffset) / day) + 2) * day - bangkokOffset;

  const approveHotel = () => confirm(booking.registerHotel(hotel.address, rooms));
  const mint = (date = stayDate) => confirm(booking.connect(hotel).getFunction("createNight")(date, rooms, primaryPrice));
  const buy = () => confirm(booking.connect(firstTraveler).getFunction("buyNight")(1n, { value: primaryPrice }));
  const list = () => confirm(booking.connect(firstTraveler).getFunction("listForResale")(1n, resalePrice));
  const resell = () => confirm(booking.connect(resaleBuyer).getFunction("buyResale")(1n, firstTraveler.address, { value: resalePrice }));
  const advance = async (time: number) => {
    await ethers.provider.send("evm_setNextBlockTimestamp", [time]);
    await ethers.provider.send("evm_mine", []);
  };

  return { booking, owner, hotel, firstTraveler, resaleBuyer, stayDate, provider: ethers.provider, address,
    approveHotel, mint, buy, list, resell, advance };
}

async function confirm(transaction: Promise<ContractTransactionResponse>) {
  const receipt = await (await transaction).wait();
  assert.ok(receipt);
  assert.equal(receipt.status, 1);
  return receipt;
}

type Fixture = Awaited<ReturnType<typeof deploy>>;

for (const [label, source] of [
  ["unchanged Remix upload", originalSource],
  ["patched candidate", patchedSource],
]) {
  describe("StayCoinNightTokenV2 · " + label, function () {
    let connection: Connection;
    let fixture: Fixture;

    beforeEach(async () => {
      connection = await network.create();
      fixture = await deploy(connection, source);
    });
    afterEach(async () => connection?.close());

    it("uses the compiled V2 ABI for hotel registration, payable purchases, holder reads, and withdrawals", async () => {
      const abi = fixture.booking.interface;
      const expected = [
        ["registerHotel(address,uint256)", "nonpayable"],
        ["createNight(uint256,uint256,uint256)", "nonpayable"],
        ["buyNight(uint256)", "payable"],
        ["listForResale(uint256,uint256)", "nonpayable"],
        ["quoteResale(uint256)", "view"],
        ["buyResale(uint256,address)", "payable"],
        ["checkIn(uint256,address)", "nonpayable"],
        ["currentHolder(uint256)", "view"],
        ["pendingWithdrawals(address)", "view"],
        ["withdraw()", "nonpayable"],
      ];
      for (const [signature, mutability] of expected) {
        const method = abi.getFunction(signature);
        assert.ok(method, "Missing " + signature);
        assert.equal(method.format("sighash"), signature);
        assert.equal(method.stateMutability, mutability);
      }
      assert.deepEqual(abi.getFunction("quoteResale")?.outputs.map(({ name }) => name),
        ["sellerReceives", "hotelReceives", "platformReceives"]);
    });

    it("completes registration, mint, primary purchase, resale, check-in, and gas-adjusted withdrawals", async () => {
      const { booking, owner, hotel, firstTraveler, resaleBuyer, stayDate, provider, address,
        approveHotel, mint, buy, list, resell, advance } = fixture;
      assert.equal((await provider.getNetwork()).chainId, 31337n);
      assert.equal(await booking.owner(), owner.address);
      await approveHotel();
      assert.deepEqual(Array.from(await booking.hotels(hotel.address)), [true, rooms]);

      await mint();
      const night = await booking.nights(1n);
      assert.equal(night.hotel, hotel.address);
      assert.equal(night.stayDate, BigInt(stayDate));
      assert.equal(night.originalPrice, primaryPrice);
      assert.equal(await booking.currentHolder(1n), hotel.address);
      assert.equal(await booking.balanceOf(hotel.address, 1n), 1n);
      assert.equal(await booking.nextNightId(), 2n);

      const travelerBefore = await provider.getBalance(firstTraveler.address);
      const purchase = await buy();
      assert.equal(await provider.getBalance(firstTraveler.address, purchase.blockNumber), travelerBefore - primaryPrice - purchase.fee);
      assert.equal(await booking.currentHolder(1n), firstTraveler.address);
      assert.equal(await booking.balanceOf(firstTraveler.address, 1n), 1n);
      assert.equal(await booking.balanceOf(hotel.address, 1n), 0n);
      assert.equal(await booking.pendingWithdrawals(owner.address), primaryFee);
      assert.equal(await booking.pendingWithdrawals(hotel.address), hotelPrimary);
      assert.equal(await booking.bondHeld(1n), originalBond);
      assert.equal(await provider.getBalance(address, purchase.blockNumber), primaryPrice);

      await list();
      assert.equal((await booking.nights(1n)).listingSeller, firstTraveler.address);
      assert.equal((await booking.nights(1n)).listingPrice, resalePrice);
      assert.deepEqual(Array.from(await booking.quoteResale(1n)), [resaleSellerAmount, resaleHotelShare, resaleFee]);

      const buyerBefore = await provider.getBalance(resaleBuyer.address);
      const resale = await resell();
      assert.equal(await provider.getBalance(resaleBuyer.address, resale.blockNumber), buyerBefore - resalePrice - resale.fee);
      assert.equal(await booking.currentHolder(1n), resaleBuyer.address);
      assert.equal(await booking.balanceOf(firstTraveler.address, 1n), 0n);
      assert.equal(await booking.balanceOf(resaleBuyer.address, 1n), 1n);
      const transferred = await booking.nights(1n);
      assert.equal(transferred.lastPaidPrice, resalePrice);
      assert.equal(transferred.listingPrice, 0n);
      assert.equal(transferred.listingSeller, ZeroAddress);
      assert.equal(await booking.pendingWithdrawals(firstTraveler.address), resaleSellerAmount);
      assert.equal(await booking.pendingWithdrawals(hotel.address), hotelPrimary + resaleHotelShare);
      assert.equal(await booking.pendingWithdrawals(owner.address), primaryFee + resaleFee);
      assert.equal(await booking.bondHeld(1n), originalBond);
      assert.equal(await provider.getBalance(address, resale.blockNumber), primaryPrice + resalePrice);

      await advance(stayDate);
      await confirm(booking.connect(hotel).getFunction("checkIn")(1n, resaleBuyer.address));
      assert.equal((await booking.nights(1n)).redeemed, true);
      assert.equal(await booking.currentHolder(1n), ZeroAddress);
      assert.equal(await booking.balanceOf(resaleBuyer.address, 1n), 0n);
      assert.equal(await booking.bondHeld(1n), 0n);

      const payouts = [
        [owner, parseEther("0.000095")],
        [hotel, parseEther("0.001075")],
        [firstTraveler, resaleSellerAmount],
      ] as const;
      let remaining = primaryPrice + resalePrice;
      for (const [payee, amount] of payouts) {
        assert.equal(await booking.pendingWithdrawals(payee.address), amount);
        const before = await provider.getBalance(payee.address);
        const receipt = await confirm(booking.connect(payee).getFunction("withdraw")());
        assert.equal(await provider.getBalance(payee.address, receipt.blockNumber), before + amount - receipt.fee);
        assert.equal(await booking.pendingWithdrawals(payee.address), 0n);
        remaining -= amount;
        assert.equal(await provider.getBalance(address, receipt.blockNumber), remaining);
      }
      assert.equal(remaining, 0n);
      await assert.rejects(booking.connect(hotel).getFunction("withdraw")(), /Nothing to withdraw/);
      await assert.rejects(booking.connect(resaleBuyer).getFunction("withdraw")(), /Nothing to withdraw/);
    });

    it("rejects unauthorized hotel approval, unapproved minting, and a mismatched room count", async () => {
      const { booking, hotel, firstTraveler, stayDate, approveHotel } = fixture;
      await assert.rejects(booking.connect(firstTraveler).getFunction("registerHotel")(hotel.address, rooms), /OwnableUnauthorizedAccount/);
      await assert.rejects(booking.connect(hotel).getFunction("createNight")(stayDate, rooms, primaryPrice), /Hotel not approved/);
      await approveHotel();
      await assert.rejects(booking.connect(firstTraveler).getFunction("createNight")(stayDate, rooms, primaryPrice), /Hotel not approved/);
      await assert.rejects(booking.connect(hotel).getFunction("createNight")(stayDate, rooms + 1n, primaryPrice), /Use approved room count/);
      assert.equal(await booking.nextNightId(), 1n);
    });

    it("caps a 60-room hotel at 12 booking tokens per stay date", async () => {
      const { booking, hotel, stayDate, approveHotel, mint } = fixture;
      await approveHotel();
      for (let i = 0; i < 12; i += 1) await mint();
      const key = keccak256(AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [hotel.address, stayDate]));
      assert.equal(await booking.issuedForDate(key), 12n);
      await assert.rejects(mint(), /20 percent cap reached/);
      await mint(stayDate + day);
      assert.equal(await booking.nextNightId(), 14n);
    });

    it("rejects missing, underpaid, and overpaid primary ETH while keeping the token available", async () => {
      const { booking, hotel, firstTraveler, provider, address, approveHotel, mint } = fixture;
      await approveHotel();
      await mint();
      const purchase = booking.connect(firstTraveler).getFunction("buyNight");
      await assert.rejects(purchase(1n), /Incorrect test ETH payment/);
      await assert.rejects(purchase(1n, { value: primaryPrice - 1n }), /Incorrect test ETH payment/);
      await assert.rejects(purchase(1n, { value: primaryPrice + 1n }), /Incorrect test ETH payment/);
      assert.equal(await booking.currentHolder(1n), hotel.address);
      assert.equal((await booking.nights(1n)).sold, false);
      assert.equal(await booking.bondHeld(1n), 0n);
      assert.equal(await provider.getBalance(address), 0n);
    });

    it("rejects a second primary sale and a second purchase of the same resale listing", async () => {
      const { booking, owner, firstTraveler, resaleBuyer, approveHotel, mint, buy, list, resell } = fixture;
      await approveHotel();
      await mint();
      await buy();
      await assert.rejects(booking.connect(resaleBuyer).getFunction("buyNight")(1n, { value: primaryPrice }), /Not available/);
      await list();
      await resell();
      await assert.rejects(resell(), /Incorrect listed price/);
      assert.equal(await booking.currentHolder(1n), resaleBuyer.address);
      assert.equal(await booking.pendingWithdrawals(firstTraveler.address), resaleSellerAmount);
      assert.equal(await booking.pendingWithdrawals(owner.address), primaryFee + resaleFee);
    });

    it("rejects invalid resale attempts after a booking is purchased", async () => {
      const { booking, firstTraveler, resaleBuyer, approveHotel, mint, buy, list, resell } = fixture;
      await approveHotel();
      await mint();
      await buy();
      await assert.rejects(resell(), /Incorrect listed price/);
      await assert.rejects(booking.connect(resaleBuyer).getFunction("listForResale")(1n, resalePrice), /Not holder/);
      await list();
      const purchase = booking.connect(resaleBuyer).getFunction("buyResale");
      await assert.rejects(purchase(1n, firstTraveler.address, { value: resalePrice - 1n }), /Incorrect listed price/);
      await assert.rejects(purchase(1n, firstTraveler.address, { value: resalePrice + 1n }), /Incorrect listed price/);
      await assert.rejects(purchase(1n, resaleBuyer.address, { value: resalePrice }), /Wrong listing seller/);
      await assert.rejects(booking.connect(firstTraveler).getFunction("buyResale")(1n, firstTraveler.address,
        { value: resalePrice }), /Invalid buyer\/seller/);
      await confirm(booking.connect(firstTraveler).getFunction("cancelListing")(1n));
      await assert.rejects(resell(), /Incorrect listed price/);
      assert.equal(await booking.currentHolder(1n), firstTraveler.address);
      assert.equal(await booking.pendingWithdrawals(firstTraveler.address), 0n);
    });

    it("rejects check-in by a non-hotel, check-in of the wrong guest, and duplicate check-in", async () => {
      const { booking, hotel, firstTraveler, resaleBuyer, stayDate, approveHotel, mint, buy, advance } = fixture;
      await approveHotel();
      await mint();
      await buy();
      await advance(stayDate);
      const checkIn = booking.connect(hotel).getFunction("checkIn");
      await assert.rejects(booking.connect(resaleBuyer).getFunction("checkIn")(1n, firstTraveler.address), /Only issuing hotel/);
      await assert.rejects(checkIn(1n, resaleBuyer.address), /Traveler not holder/);
      await confirm(checkIn(1n, firstTraveler.address));
      await assert.rejects(checkIn(1n, firstTraveler.address), /Not redeemable/);
      assert.equal(await booking.pendingWithdrawals(hotel.address), hotelPrimary + originalBond);
    });

    it("burns an expired sold token and settles the held bond once", async () => {
      const { booking, firstTraveler, resaleBuyer, stayDate, approveHotel, mint, buy, list, advance } = fixture;
      await approveHotel();
      await mint();
      await buy();
      await list();
      await advance(stayDate + day);
      await confirm(booking.connect(resaleBuyer).getFunction("expireNight")(1n));
      assert.equal(await booking.currentHolder(1n), ZeroAddress);
      assert.equal(await booking.balanceOf(firstTraveler.address, 1n), 0n);
      assert.equal(await booking.expiredHolder(1n), firstTraveler.address);
      assert.equal((await booking.nights(1n)).listingPrice, 0n);
      assert.equal(await booking.bondHeld(1n), originalBond);
      await assert.rejects(booking.settleExpiredBond(1n, resaleBuyer.address), /Invalid recipient/);
      await confirm(booking.settleExpiredBond(1n, firstTraveler.address));
      assert.equal(await booking.bondHeld(1n), 0n);
      assert.equal(await booking.pendingWithdrawals(firstTraveler.address), originalBond);
      await assert.rejects(booking.settleExpiredBond(1n, firstTraveler.address), /No bond available/);
    });
  });
}

describe("StayCoinNightTokenV2 · hardened policy", function () {
  let connection: Connection;
  let fixture: Fixture;
  beforeEach(async () => {
    connection = await network.create();
    fixture = await deploy(connection, patchedSource);
    await fixture.approveHotel();
  });
  afterEach(async () => connection?.close());

  it("accepts Bangkok midnight as the inventory date and rejects other times", async () => {
    const { stayDate, mint } = fixture;
    await mint();
    await assert.rejects(mint(stayDate + 12 * 3600), /Use Bangkok midnight/);
    await mint(stayDate + day);
  });

  it("allows check-in during the stay day and closes primary and resale sales at its start", async () => {
    const { booking, hotel, firstTraveler, resaleBuyer, stayDate, mint, buy, list, resell, advance } = fixture;
    await mint();
    await mint();
    await buy();
    await list();
    const checkIn = booking.connect(hotel).getFunction("checkIn");
    await assert.rejects(checkIn(1n, firstTraveler.address), /Outside check-in day/);

    await advance(stayDate);
    await assert.rejects(booking.connect(resaleBuyer).getFunction("buyNight")(2n, { value: primaryPrice }), /Night expired/);
    await assert.rejects(booking.quoteResale(1n), /Night expired/);
    await assert.rejects(resell(), /Night expired/);
    await assert.rejects(booking.expireNight(1n), /Stay not expired/);
    await confirm(checkIn(1n, firstTraveler.address));
    assert.equal(await booking.balanceOf(firstTraveler.address, 1n), 0n);
  });

  it("closes check-in at the end of the stay day and opens expiry", async () => {
    const { booking, hotel, firstTraveler, stayDate, mint, buy, advance } = fixture;
    await mint();
    await buy();
    await advance(stayDate + day);
    await assert.rejects(booking.connect(hotel).getFunction("checkIn")(1n, firstTraveler.address), /Outside check-in day/);
    await confirm(booking.expireNight(1n));
    assert.equal((await booking.nights(1n)).expired, true);
  });

  it("retains an owner for platform fees and bond settlement", async () => {
    const { booking, owner } = fixture;
    await assert.rejects(booking.renounceOwnership(), /Platform owner required/);
    assert.equal(await booking.owner(), owner.address);
  });
});
