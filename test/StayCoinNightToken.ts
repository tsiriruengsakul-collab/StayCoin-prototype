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

  it("issues non-transferable StayPoints once at check-in and funds up to a 20% discount", async () => {
    await book();
    await mint(date + 2 * day);
    await assert.rejects(contract.connect(traveler).fundRewards({ value: price }), /OwnableUnauthorizedAccount/);
    await (await contract.fundRewards({ value: price })).wait();
    assert.equal(await contract.pointBalance(traveler.address), 0n);
    await advance(date);
    await (await contract.connect(hotel).checkIn(1, traveler.address)).wait();
    const earned = price / await contract.POINT_EARN_UNIT();
    assert.equal(await contract.pointBalance(traveler.address), earned);
    await assert.rejects(contract.connect(hotel).checkIn(1, traveler.address), /Not redeemable/);
    assert.equal(await contract.pointBalance(buyer.address), 0n);

    const discount = earned * await contract.POINT_VALUE();
    await assert.rejects(contract.connect(traveler).buyNightWithPoints(2, earned + 1n, { value: price }), /Points exceed limit/);
    await assert.rejects(contract.connect(traveler).buyNightWithPoints(2, earned, { value: price }), /Incorrect test ETH payment/);
    await (await contract.connect(traveler).buyNightWithPoints(2, earned, { value: price - discount })).wait();
    assert.equal(await contract.pointBalance(traveler.address), 0n);
    assert.equal(await contract.rewardsReserve(), price - discount);
    assert.equal(await contract.proceeds(hotel.address), 2n * price * 95n / 100n);
    assert.equal((await contract.nights(2)).lastPaidPrice, price - discount);
  });

  it("rejects discounts with insufficient reserve, applies the 20% cap, and expires unused points", async () => {
    await book();
    const small = parseEther("0.00005");
    await (await contract.connect(hotel).createNight(date + day, "Small room", small)).wait();
    await mint(date + 2 * day);
    await advance(date);
    await (await contract.connect(hotel).checkIn(1, traveler.address)).wait();
    await assert.rejects(contract.connect(traveler).buyNightWithPoints(2, 11, { value: small }), /Points exceed limit/);
    await assert.rejects(contract.connect(traveler).buyNightWithPoints(3, 1, { value: price }), /Rewards reserve too low/);
    await advance(Number(await contract.pointsExpireAt(traveler.address)));
    assert.equal(await contract.pointBalance(traveler.address), 0n);
  });

  const passPrice = parseEther("0.0014");
  const seasonEnd = () => date + 3 * day;
  async function preparePass() {
    await (await contract.setHotelTier(hotel.address, 4)).wait();
    await (await contract.createHappyPass(4, date, seasonEnd(), passPrice)).wait();
    await mint();
    await (await contract.connect(hotel).commitHappyNight(1, 1)).wait();
  }

  it("presells only committed nights, and burns a redeemed pass for a real hotel booking", async () => {
    await preparePass();
    await (await contract.registerHotel(outsider.address, "Demo Garden", "Krabi", 20)).wait();
    await (await contract.setHotelTier(outsider.address, 4)).wait();
    await (await contract.connect(outsider).createNight(date + day, "Suite", price)).wait();
    await (await contract.connect(outsider).commitHappyNight(1, 2)).wait();
    await assert.rejects(contract.connect(traveler).buyNight(1, { value: price }), /Not available/);
    await assert.rejects(contract.connect(traveler).buyHappyPass(1, { value: price }), /Incorrect test ETH payment/);
    await (await contract.connect(traveler).buyHappyPass(1, { value: passPrice })).wait();
    await (await contract.connect(buyer).buyHappyPass(1, { value: passPrice })).wait();
    await assert.rejects(contract.connect(outsider).buyHappyPass(1, { value: passPrice }), /Pass unavailable/);
    const pass = await contract.happyPasses(1);
    const token = await ethers.getContractAt("HappyPassToken", pass.token);
    assert.equal(await token.decimals(), 0n);
    assert.equal(await token.balanceOf(traveler.address), 1n);
    assert.equal(await contract.proceeds(hotel.address), 0n);
    await (await contract.connect(traveler).redeemHappyPass(1, 2)).wait();
    assert.equal(await token.balanceOf(traveler.address), 0n);
    assert.equal(await contract.balanceOf(traveler.address, 2), 1n);
    assert.equal(await contract.proceeds(outsider.address), passPrice * 95n / 100n);
    assert.equal(await contract.proceeds(owner.address), passPrice / 20n);
    await assert.rejects(contract.connect(buyer).redeemHappyPass(1, 2), /Night unavailable/);
    const block = await ethers.provider.getBlock("latest");
    assert.ok(block);
    const web = new Contract(await contract.getAddress(), nightTokenAbi, ethers.provider);
    const market = await readMarket(web, buyer.address, block.number);
    assert.equal(market.passes[0].balance, 1n);
    assert.equal(market.nights[1].passId, 1n);
  });

  it("enforces season, tier and pricing rules for committed inventory", async () => {
    await (await contract.createHappyPass(4, date, seasonEnd(), passPrice)).wait();
    await mint();
    await assert.rejects(contract.connect(hotel).commitHappyNight(1, 1), /tier mismatch/);
    await (await contract.setHotelTier(hotel.address, 4)).wait();
    await mint(seasonEnd());
    await assert.rejects(contract.connect(hotel).commitHappyNight(1, 2), /outside season/);
    await (await contract.connect(hotel).createNight(date + day, "Basic", passPrice)).wait();
    await assert.rejects(contract.connect(hotel).commitHappyNight(1, 3), /at least 30 percent cheaper/);
    await advance(date);
    await assert.rejects(contract.connect(hotel).commitHappyNight(1, 1), /presale closed/);
    await assert.rejects(contract.connect(traveler).buyHappyPass(1, { value: passPrice }), /Pass unavailable/);
  });

  it("transfers a valid pass before expiry and refunds its current holder once after expiry", async () => {
    await preparePass();
    await (await contract.connect(traveler).buyHappyPass(1, { value: passPrice })).wait();
    const token = await ethers.getContractAt("HappyPassToken", (await contract.happyPasses(1)).token);
    await (await token.connect(traveler).transfer(buyer.address, 1)).wait();
    await assert.rejects(contract.connect(buyer).refundExpiredPass(1), /has not ended/);
    await advance(seasonEnd());
    await assert.rejects(token.connect(buyer).transfer(traveler.address, 1), /Pass expired/);
    await (await contract.connect(buyer).refundExpiredPass(1)).wait();
    assert.equal(await contract.proceeds(buyer.address), passPrice);
    assert.equal(await token.totalSupply(), 0n);
    await assert.rejects(contract.connect(buyer).refundExpiredPass(1), /ERC20InsufficientBalance/);
  });

  async function protectedBooking() {
    await mint();
    await assert.rejects(contract.connect(hotel).protectNight(1), /Bond available is too low/);
    await (await contract.connect(hotel).depositHotelBond({ value: price })).wait();
    await (await contract.connect(hotel).protectNight(1)).wait();
    await (await contract.connect(traveler).buyNight(1, { value: price })).wait();
  }

  it("locks prefunded protection, resolves a valid claim and credits the current holder after resale", async () => {
    await protectedBooking();
    await assert.rejects(contract.connect(hotel).withdrawHotelBond(price), /Bond unavailable/);
    await assert.rejects(contract.connect(traveler).requestBondRefund(1), /not eligible/);
    await (await contract.connect(traveler).listForResale(1, ask)).wait();
    await (await contract.connect(buyer).buyResale(1, traveler.address, { value: ask })).wait();
    assert.equal(await contract.resaleCount(1), 1n);
    assert.equal(await contract.resaleVolume(1), ask);
    await advance(date);
    await assert.rejects(contract.connect(traveler).requestBondRefund(1), /not eligible/);
    await (await contract.connect(buyer).requestBondRefund(1)).wait();
    await assert.rejects(contract.connect(hotel).checkIn(1, buyer.address), /claim pending/);
    await assert.rejects(contract.connect(hotel).resolveBondClaim(1, true), /OwnableUnauthorizedAccount/);
    await (await contract.resolveBondClaim(1, true)).wait();
    assert.equal(await contract.proceeds(buyer.address), price);
    assert.equal(await contract.hotelBond(hotel.address), 0n);
    assert.equal(await contract.hotelBondLocked(hotel.address), 0n);
    assert.equal(await contract.balanceOf(buyer.address, 1), 0n);
    assert.equal(await contract.bondClaims(1), 3n);
    assert.equal(await contract.pointBalance(buyer.address), 0n);
    await assert.rejects(contract.resolveBondClaim(1, true), /No pending claim/);
  });

  it("releases collateral at check-in and lets hotels move free collateral to proceeds", async () => {
    await protectedBooking();
    await advance(date);
    await (await contract.connect(hotel).checkIn(1, traveler.address)).wait();
    assert.equal(await contract.hotelBondLocked(hotel.address), 0n);
    assert.equal(await contract.nightBond(1), 0n);
    await (await contract.connect(hotel).withdrawHotelBond(price)).wait();
    assert.equal(await contract.proceeds(hotel.address), price + price * 95n / 100n);
  });

  it("allows recovery for a pending claim after the review window", async () => {
    await protectedBooking();
    await advance(date);
    await (await contract.connect(traveler).requestBondRefund(1)).wait();
    await assert.rejects(contract.connect(traveler).claimTimedOutBond(1), /Review window is open/);
    await advance(date + 7 * day);
    await assert.rejects(contract.resolveBondClaim(1, false), /Review window ended/);
    await (await contract.connect(traveler).claimTimedOutBond(1)).wait();
    assert.equal(await contract.proceeds(traveler.address), price);
  });

  it("returns only surplus seasonal inventory during presale", async () => {
    await preparePass();
    await mint(date + day);
    await (await contract.connect(hotel).commitHappyNight(1, 2)).wait();
    await (await contract.connect(traveler).buyHappyPass(1, { value: passPrice })).wait();
    await (await contract.connect(hotel).releaseHappyNight(2)).wait();
    assert.equal(await contract.passForNight(2), 0n);
    await (await contract.connect(buyer).buyNight(2, { value: price })).wait();
    await assert.rejects(contract.connect(hotel).releaseHappyNight(1), /reserved for pass holders/);
  });

  it("restores points and the rewards reserve after an approved protected primary refund", async () => {
    await book();
    await mint(date + day);
    await (await contract.fundRewards({ value: price })).wait();
    await (await contract.connect(hotel).depositHotelBond({ value: price })).wait();
    await (await contract.connect(hotel).protectNight(2)).wait();
    await advance(date);
    await (await contract.connect(hotel).checkIn(1, traveler.address)).wait();
    const points = await contract.pointBalance(traveler.address);
    const net = price - points * await contract.POINT_VALUE();
    await (await contract.connect(traveler).buyNightWithPoints(2, points, { value: net })).wait();
    await advance(date + day);
    await (await contract.connect(traveler).requestBondRefund(2)).wait();
    await (await contract.resolveBondClaim(2, true)).wait();
    assert.equal(await contract.pointBalance(traveler.address), points);
    assert.equal(await contract.rewardsReserve(), price);
    assert.equal(await contract.proceeds(traveler.address), net);
    assert.equal(await contract.hotelBond(hotel.address), 0n);
  });

});
