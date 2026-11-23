import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "mocha";
import { network } from "hardhat";
import { Contract, parseEther } from "ethers";
import { nightTokenAbi, dateKey, bookingDate, readMarket, resaleSplit } from "../src/chain.js";

const price = parseEther("0.002");
const ask = parseEther("0.003");
const offset = 7 * 3600;
const day = 86400;

describe("StayCoin Night Token", function () {
  let connection: Awaited<ReturnType<typeof network.create>>;
  let ethers: Awaited<ReturnType<typeof network.create>>["ethers"];
  type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];
  let owner: Signer, hotel: Signer, traveler: Signer, buyer: Signer, outsider: Signer;
  // The contract is deployed from compiled artifacts and its methods come from the ABI.
  let contract: any;
  let date: number;

  before(async () => {
    connection = await network.create();
    ethers = connection.ethers;
    [owner, hotel, traveler, buyer, outsider] = await ethers.getSigners();
  });
  after(async () => connection?.close());
  beforeEach(async () => {
    contract = await ethers.deployContract("StayCoinNightToken");
    await contract.waitForDeployment();
    await (await contract.registerHotel(hotel.address, "Demo Tide House", "Phuket", 12)).wait();
    const block = await ethers.provider.getBlock("latest");
    assert.ok(block);
    date = (Math.floor((block.timestamp + offset) / day) + 2) * day - offset;
  });

  const mint = async (stayDate = date) => {
    await (await contract.connect(hotel).createNight(stayDate, "Ocean-view king", price)).wait();
  };
  const book = async () => {
    await mint();
    await (await contract.connect(traveler).buyNight(1, { value: price })).wait();
  };
  const advance = async (time: number) => {
    await ethers.provider.send("evm_setNextBlockTimestamp", [time]);
    await ethers.provider.send("evm_mine", []);
  };

  it("mints exactly one ERC-1155 unit for a registered hotel", async () => {
    await mint();
    const night = await contract.nights(1);
    assert.equal(night.hotel, hotel.address);
    assert.equal(night.holder, hotel.address);
    assert.equal(night.roomType, "Ocean-view king");
    assert.equal(night.originalPrice, price);
    assert.equal(await contract.balanceOf(hotel.address, 1), 1n);
    assert.equal(await contract.nextNightId(), 2n);
    assert.equal(await contract.symbol(), "STAY");
  });

  it("caps inventory at floor(20% of rooms) independently for each date", async () => {
    await mint();
    await mint();
    assert.equal(await contract.issuedForDate(hotel.address, date), 2n);
    await assert.rejects(contract.connect(hotel).createNight(date, "Garden suite", price), /inventory cap reached/);
    await mint(date + day);
    assert.equal(await contract.issuedForDate(hotel.address, date + day), 1n);
  });

  it("rejects unregistered minting and unauthorized or duplicate hotel registration", async () => {
    await assert.rejects(contract.connect(outsider).createNight(date, "Suite", price), /Only registered hotels/);
    await assert.rejects(contract.connect(outsider).registerHotel(outsider.address, "Demo", "Phuket", 60), /OwnableUnauthorizedAccount/);
    await assert.rejects(contract.registerHotel(hotel.address, "New name", "Phuket", 600), /registered hotel/);
  });

  it("rejects partial-day dates, past dates and zero prices", async () => {
    await assert.rejects(contract.connect(hotel).createNight(date + 60, "Suite", price), /Bangkok midnight/);
    await assert.rejects(contract.connect(hotel).createNight(date - 3 * day, "Suite", price), /Bangkok midnight/);
    await assert.rejects(contract.connect(hotel).createNight(date, "Suite", 0), /Price required/);
  });

  it("rejects zero, underpayment and overpayment without changing ownership", async () => {
    await mint();
    for (const value of [0n, price - 1n, price + 1n]) {
      await assert.rejects(contract.connect(traveler).buyNight(1, { value }), /Incorrect test ETH payment/);
    }
    assert.equal(await contract.balanceOf(hotel.address, 1), 1n);
    assert.equal(await contract.proceeds(hotel.address), 0n);
  });

  it("transfers a primary booking and allocates the 5% commission", async () => {
    await book();
    assert.equal((await contract.nights(1)).holder, traveler.address);
    assert.equal(await contract.balanceOf(traveler.address, 1), 1n);
    assert.equal(await contract.balanceOf(hotel.address, 1), 0n);
    assert.equal(await contract.proceeds(owner.address), price * 5n / 100n);
    assert.equal(await contract.proceeds(hotel.address), price * 95n / 100n);
    assert.equal(await ethers.provider.getBalance(await contract.getAddress()), price);
  });

  it("prevents two primary purchases of the same room", async () => {
    await book();
    await assert.rejects(contract.connect(buyer).buyNight(1, { value: price }), /Not available/);
  });

  it("restricts listings and ERC-1155 direct transfers", async () => {
    await book();
    await assert.rejects(contract.connect(outsider).listForResale(1, ask), /Not holder/);
    await assert.rejects(contract.connect(traveler).safeTransferFrom(traveler.address, buyer.address, 1, 1, "0x"), /marketplace transfer/);
    await assert.rejects(contract.connect(traveler).safeBatchTransferFrom(traveler.address, buyer.address, [1], [1], "0x"), /marketplace transfer/);
  });

  it("executes a resale, pays 25% of profit and 3% of the resale price, and moves ownership", async () => {
    await book();
    await (await contract.connect(traveler).listForResale(1, ask)).wait();
    await (await contract.connect(buyer).buyResale(1, traveler.address, { value: ask })).wait();
    const hotelShare = (ask - price) / 4n;
    const fee = ask * 3n / 100n;
    const night = await contract.nights(1);
    assert.equal(night.holder, buyer.address);
    assert.equal(night.lastPaidPrice, ask);
    assert.equal(night.listingPrice, 0n);
    assert.equal(await contract.balanceOf(traveler.address, 1), 0n);
    assert.equal(await contract.balanceOf(buyer.address, 1), 1n);
    assert.equal(await contract.proceeds(traveler.address), ask - hotelShare - fee);
    assert.equal(await contract.proceeds(hotel.address), price * 95n / 100n + hotelShare);
    assert.equal(await contract.proceeds(owner.address), price / 20n + fee);
    await assert.rejects(contract.connect(outsider).buyResale(1, traveler.address, { value: ask }), /Incorrect listed price/);
  });

  it("charges no hotel share on a loss and uses the latest purchase price on later resales", async () => {
    await book();
    const lossPrice = price / 2n;
    await (await contract.connect(traveler).listForResale(1, lossPrice)).wait();
    await (await contract.connect(buyer).buyResale(1, traveler.address, { value: lossPrice })).wait();
    assert.equal(await contract.proceeds(hotel.address), price * 95n / 100n);
    await (await contract.connect(buyer).listForResale(1, price)).wait();
    await (await contract.connect(outsider).buyResale(1, buyer.address, { value: price })).wait();
    assert.equal(await contract.proceeds(hotel.address), price * 95n / 100n + (price - lossPrice) / 4n);
  });

  it("rejects a wrong seller, incorrect amount, self-purchase, and cancelled listing", async () => {
    await book();
    await (await contract.connect(traveler).listForResale(1, ask)).wait();
    await assert.rejects(contract.connect(buyer).buyResale(1, outsider.address, { value: ask }), /Invalid seller/);
    await assert.rejects(contract.connect(buyer).buyResale(1, traveler.address, { value: price }), /Incorrect listed price/);
    await assert.rejects(contract.connect(traveler).buyResale(1, traveler.address, { value: ask }), /Invalid seller/);
    await assert.rejects(contract.connect(outsider).cancelListing(1), /No owned listing/);
    await (await contract.connect(traveler).cancelListing(1)).wait();
    await assert.rejects(contract.connect(buyer).buyResale(1, traveler.address, { value: ask }), /Incorrect listed price/);
  });

  it("closes primary sales and resales at Bangkok midnight on the stay date", async () => {
    await book();
    await mint();
    await (await contract.connect(traveler).listForResale(1, ask)).wait();
    await advance(date);
    await assert.rejects(contract.connect(buyer).buyNight(2, { value: price }), /Night expired/);
    await assert.rejects(contract.connect(buyer).buyResale(1, traveler.address, { value: ask }), /Not resale eligible/);
    await assert.rejects(contract.connect(traveler).listForResale(1, ask), /Not resale eligible/);
  });

  it("checks holder and hotel authorization, burns on check-in and prevents duplicate redemption", async () => {
    await book();
    await (await contract.connect(traveler).listForResale(1, ask)).wait();
    await assert.rejects(contract.connect(hotel).checkIn(1, traveler.address), /Outside check-in day/);
    await advance(date);
    await assert.rejects(contract.connect(outsider).checkIn(1, traveler.address), /Only hotel/);
    await assert.rejects(contract.connect(hotel).checkIn(1, buyer.address), /Traveler not holder/);
    await (await contract.connect(hotel).checkIn(1, traveler.address)).wait();
    assert.equal(await contract.balanceOf(traveler.address, 1), 0n);
    assert.equal((await contract.nights(1)).redeemed, true);
    assert.equal((await contract.nights(1)).listingPrice, 0n);
    await assert.rejects(contract.connect(hotel).checkIn(1, traveler.address), /Not redeemable/);
    await assert.rejects(contract.connect(traveler).listForResale(1, ask), /Not resale eligible/);
  });

  it("blocks check-in once the Bangkok stay date has ended", async () => {
    await book();
    await advance(date + day);
    await assert.rejects(contract.connect(hotel).checkIn(1, traveler.address), /Outside check-in day/);
  });

  it("allows a payout only from the caller's balance and prevents a second withdrawal", async () => {
    await book();
    await assert.rejects(contract.connect(outsider).withdrawProceeds(outsider.address), /No proceeds/);
    const before = await ethers.provider.getBalance(outsider.address);
    await (await contract.connect(hotel).withdrawProceeds(outsider.address)).wait();
    assert.equal(await ethers.provider.getBalance(outsider.address) - before, price * 95n / 100n);
    assert.equal(await contract.proceeds(hotel.address), 0n);
    await assert.rejects(contract.connect(hotel).withdrawProceeds(hotel.address), /No proceeds/);
  });
  it("reads the local contract through the frontend ABI and verifies the on-chain resale quote", async () => {
    await book();
    const web = new Contract(await contract.getAddress(), nightTokenAbi, ethers.provider);
    const block = await ethers.provider.getBlock("latest");
    assert.ok(block);
    const snapshot = await readMarket(web, traveler.address, block.number);
    const night = snapshot.nights[0];
    assert.equal(night.property.name, "Demo Tide House");
    assert.equal(night.holder, traveler.address);
    assert.equal(night.originalPrice, price);
    assert.equal(bookingDate(dateKey(night.stayDate)), BigInt(date));
    const quote = resaleSplit(ask, night.lastPaidPrice);
    await (await web.connect(traveler).getFunction("listForResale")(1, ask)).wait();
    const listed = await web.nights(1);
    await (await web.connect(buyer).getFunction("buyResale")(1, listed.holder, { value: listed.listingPrice })).wait();
    assert.equal(await web.proceeds(traveler.address), quote.seller);
    assert.equal(await web.proceeds(hotel.address), price * 95n / 100n + quote.hotel);
    assert.equal(await web.proceeds(owner.address), price / 20n + quote.platform);
  });

});
