import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "mocha";
import { network } from "hardhat";
import { Contract, Interface, ZeroAddress, type ContractTransactionResponse, type TransactionResponse } from "ethers";
import { bookingDate, dateKey, DAY } from "../src/chain.js";
import { currencyAbi, estimateResale, formatTHB, marketAbi, parseGuestProof, parseTHB, proofDomain, proofTypes, purchase,
  readBookingHistory, readMarket, requireWalletContext, verifyV3 } from "../src/marketV3.js";

const thb = (baht: number) => BigInt(baht) * 100n;
const start = thb(2000);
const resale = thb(3000);
const zero = ZeroAddress;

async function confirmed(tx: Promise<ContractTransactionResponse> | TransactionResponse) {
  const receipt = await (await tx).wait();
  assert.equal(receipt?.status, 1);
  return receipt!;
}

async function fixture() {
  const connection = await network.create();
  const { ethers } = connection;
  const [owner, hotel, travelerA, travelerB, guest] = await ethers.getSigners();
  const tokenDeploy = await ethers.deployContract("MockTHB");
  const tokenAddress = await tokenDeploy.getAddress();
  const deploy = await ethers.deployContract("StayCoinNightTokenV3", [tokenAddress]);
  const address = await deploy.getAddress();
  const market = new Contract(address, deploy.interface, owner);
  const token = new Contract(tokenAddress, tokenDeploy.interface, owner);
  const latest = await ethers.provider.getBlock("latest");
  assert.ok(latest);
  const stay = bookingDate(dateKey(BigInt(latest.timestamp) + DAY * 2n));
  const mint = (date = stay) => confirmed(market.connect(hotel).getFunction("createNight")(date, start, "Deluxe King"));
  const approve = (signer: typeof owner, amount: bigint) => confirmed(token.connect(signer).getFunction("approve")(address, amount));
  const buy = () => confirmed(market.connect(travelerA).getFunction("buyNight")(1, start));
  const list = (amount = resale, signer = travelerA) => confirmed(market.connect(signer).getFunction("listForResale")(1, amount));
  const buyResale = (amount = resale, buyer = travelerB, seller = travelerA) =>
    confirmed(market.connect(buyer).getFunction("buyResale")(1, seller.address, amount));
  const advance = async (time: bigint) => {
    await ethers.provider.send("evm_setNextBlockTimestamp", [Number(time)]);
    await ethers.provider.send("evm_mine", []);
  };
  const proof = async (signer = travelerB, deadline = stay + 600n, chainId = 31337) => {
    const n = await market.nights(1);
    const args = { tokenId: 1, hotel: hotel.address, holder: signer.address, nonce: n.nonce, deadline };
    const signature = await signer.signTypedData(proofDomain(address, chainId), proofTypes, args);
    return [1, signer.address, args.nonce, deadline, signature] as const;
  };
  await confirmed(market.registerHotel(hotel.address, 60, "DemoResort"));
  for (const account of [travelerA, travelerB, guest]) await confirmed(token.mint(account.address, thb(10000)));
  return { connection, ethers, owner, hotel, travelerA, travelerB, guest, address, tokenAddress, market, token, stay, mint, approve,
    buy, list, buyResale, advance, proof, deployBlock: (await deploy.deploymentTransaction()!.wait())!.blockNumber };
}

describe("StayCoin V3 MockTHB lifecycle", function () {
  let f: Awaited<ReturnType<typeof fixture>>;
  beforeEach(async () => { f = await fixture(); });
  afterEach(async () => { await f.connection.close(); });
  const book = async () => { await f.mint(); await f.approve(f.travelerA, start); await f.buy(); };
  const resell = async () => { await book(); await f.list(); await f.approve(f.travelerB, resale); await f.buyResale(); };

  it("assigns a two-decimal educational currency and rejects tokens with other decimals", async () => {
    assert.equal(await f.token.name(), "Mock Thai Baht");
    assert.equal(await f.token.decimals(), 2n);
    const wrong = await f.ethers.deployContract("HappyPassToken", [1]);
    await assert.rejects(f.ethers.deployContract("StayCoinNightTokenV3", [await wrong.getAddress()]), /Two-decimal/);
  });

  it("pays 1,900 to the hotel and 100 to the platform on the 2,000 MockTHB primary sale", async () => {
    await book();
    assert.equal(await f.token.balanceOf(f.travelerA.address), thb(8000));
    assert.equal(await f.token.balanceOf(f.hotel.address), thb(1900));
    assert.equal(await f.token.balanceOf(f.owner.address), thb(100));
    assert.equal(await f.token.balanceOf(f.address), 0n);
    assert.equal(await f.market.balanceOf(f.travelerA.address, 1), 1n);
    assert.equal(await f.market.currentHolder(1), f.travelerA.address);
    assert.equal((await f.market.nights(1)).roomCategory, "Deluxe King");
  });

  it("pays 2,660 / 250 / 90 on resale and cannot sell the listing twice", async () => {
    await resell();
    assert.equal(await f.token.balanceOf(f.travelerA.address), thb(10660));
    assert.equal(await f.token.balanceOf(f.hotel.address), thb(2150));
    assert.equal(await f.token.balanceOf(f.owner.address), thb(190));
    assert.equal(await f.token.balanceOf(f.travelerB.address), thb(7000));
    assert.equal(await f.market.balanceOf(f.travelerB.address, 1), 1n);
    assert.equal(await f.market.balanceOf(f.travelerA.address, 1), 0n);
    await assert.rejects(f.buyResale(), /Not listed/);
    await assert.rejects(f.list(), /Not holder/);
  });

  it("keeps the original reference on repeat resale and calculates the seller’s actual loss", async () => {
    await resell();
    await f.list(thb(2800), f.travelerB);
    assert.deepEqual(Array.from(await f.market.quoteResale(1)), [thb(2516), thb(200), thb(84)]);
    assert.deepEqual(estimateResale(thb(2800), start, resale), { seller: thb(2516), hotel: thb(200), platform: thb(84), net: -thb(484) });
    await f.approve(f.guest, thb(2800));
    await f.buyResale(thb(2800), f.guest, f.travelerB);
    assert.equal(await f.token.balanceOf(f.travelerB.address), thb(9516));
    const night = await f.market.nights(1);
    assert.equal(night.originalPrice, start);
    assert.equal(night.lastPaidPrice, thb(2800));
  });

  it("charges no hotel markup below the original price and allows listing cancellation", async () => {
    await book();
    await f.list(thb(1500));
    assert.deepEqual(Array.from(await f.market.quoteResale(1)), [thb(1455), 0n, thb(45)]);
    await confirmed(f.market.connect(f.travelerA).getFunction("cancelListing")(1));
    await assert.rejects(f.buyResale(thb(1500)), /Not listed/);
  });

  it("enforces roles and prohibits direct transfers and ERC-20 minting by travelers", async () => {
    await book();
    await assert.rejects(f.market.connect(f.guest).getFunction("createNight")(f.stay, start, "Deluxe"), /Hotel not approved/);
    await assert.rejects(f.token.connect(f.guest).getFunction("mint")(f.guest.address, thb(1)), /OwnableUnauthorizedAccount/);
    await assert.rejects(f.market.connect(f.guest).getFunction("checkIn")(1, f.travelerA.address, 1, f.stay, "0x"), /Only issuing hotel/);
    await assert.rejects(f.market.connect(f.travelerA).getFunction("safeTransferFrom")(f.travelerA.address, f.guest.address, 1, 1, "0x"), /Use StayCoin marketplace/);
    await assert.rejects(f.market.connect(f.travelerA).getFunction("safeBatchTransferFrom")(f.travelerA.address, f.guest.address, [1], [1], "0x"), /Use StayCoin marketplace/);
  });

  it("rejects native ETH and atomically rolls back allocation when allowance or balance cannot cover all transfers", async () => {
    await f.mint();
    const purchaseNight = f.market.connect(f.travelerA).getFunction("buyNight");
    await assert.rejects(purchaseNight(1, start, { value: 1n }));
    await assert.rejects(f.buy(), /ERC20InsufficientAllowance/);
    await f.approve(f.travelerA, thb(1900));
    await assert.rejects(f.buy(), /ERC20InsufficientAllowance/);
    assert.equal(await f.token.allowance(f.travelerA.address, f.address), thb(1900));
    assert.equal(await f.token.balanceOf(f.hotel.address), 0n);
    assert.equal(await f.market.currentHolder(1), f.hotel.address);
    await confirmed(f.token.connect(f.travelerA).getFunction("transfer")(f.guest.address, thb(8050)));
    await f.approve(f.travelerA, start);
    await assert.rejects(f.buy(), /ERC20InsufficientBalance/);
    assert.equal(await f.token.balanceOf(f.travelerA.address), thb(1950));
    assert.equal(await f.token.balanceOf(f.hotel.address), 0n);
    assert.equal((await f.market.nights(1)).sold, false);
  });

  it("checks holder, deadline, chain and replay, then burns the eligible token once", async () => {
    await resell();
    const checkIn = f.market.connect(f.hotel).getFunction("checkIn");
    const old = await f.proof(f.travelerA);
    const wrongChain = await f.proof(f.travelerB, f.stay + 600n, 11155111);
    const expiredProof = await f.proof(f.travelerB, f.stay);
    const correct = await f.proof();
    await assert.rejects(checkIn(...correct), /Outside check-in day/);
    await f.advance(f.stay);
    await assert.rejects(checkIn(...old), /Booking holder changed/);
    await assert.rejects(checkIn(...wrongChain), /Invalid guest signature/);
    await assert.rejects(checkIn(...expiredProof), /Invalid proof deadline/);
    await assert.rejects(checkIn(correct[0], correct[1], correct[2] + 1n, correct[3], correct[4]), /Booking holder changed/);
    await confirmed(checkIn(...correct));
    assert.equal(await f.market.balanceOf(f.travelerB.address, 1), 0n);
    assert.equal(await f.market.currentHolder(1), zero);
    await assert.rejects(checkIn(...correct), /Not redeemable/);
  });

  it("closes sales at Bangkok midnight, blocks late redemption, and burns expired bookings", async () => {
    await book();
    await f.mint();
    await f.list();
    await f.approve(f.travelerB, resale);
    await f.advance(f.stay);
    await assert.rejects(f.market.connect(f.travelerB).getFunction("buyNight")(2, start), /Night expired/);
    await assert.rejects(f.buyResale(), /Night expired/);
    await f.advance(f.stay + DAY);
    await assert.rejects(f.market.connect(f.hotel).getFunction("checkIn")(...await f.proof(f.travelerA)), /Outside check-in day/);
    await confirmed(f.market.expireNight(1));
    assert.equal(await f.market.expiredHolder(1), f.travelerA.address);
    assert.equal(await f.market.balanceOf(f.travelerA.address, 1), 0n);
    await assert.rejects(f.market.expireNight(1), /Already finalized/);
  });

  it("caps one hotel’s aggregate room categories at 20 percent for one Bangkok date", async () => {
    for (let i = 0; i < 12; i++) await f.mint();
    await assert.rejects(f.mint(), /20 percent cap/);
    await assert.rejects(f.mint(f.stay + 60n), /Use Bangkok midnight/);
    await f.mint(f.stay + DAY);
    assert.equal(await f.market.nextNightId(), 14n);
  });

  it("checks both deployed interfaces and runs exact approvals, checkout, resale receipts, and history through the frontend adapter", async () => {
    await f.mint();
    const initial = (await f.ethers.provider.getBlock("latest"))!;
    const checked = await verifyV3(f.ethers.provider, f.address, f.tokenAddress, initial.number);
    assert.equal(new Interface(marketAbi).formatJson(), f.market.interface.formatJson());
    assert.equal(new Interface(currencyAbi).formatJson(), f.token.interface.formatJson());
    const snapshot = async () => {
      const block = (await f.ethers.provider.getBlock("latest"))!;
      return readMarket(checked.market, checked.token, f.travelerA.address, block.number, BigInt(block.timestamp));
    };
    const labels: string[] = [];
    const confirm = async (label: string, tx: TransactionResponse) => { labels.push(label); return confirmed(tx); };
    const run = async (signer: typeof f.owner, resaleMode: boolean) => {
      const night = (await snapshot()).nights[0];
      return purchase(new Contract(f.address, marketAbi, signer), new Contract(f.tokenAddress, currencyAbi, signer),
        night, resaleMode, signer.address, async () => {}, confirm);
    };
    const booking = await run(f.travelerA, false);
    assert.equal(booking.payout.hotel, thb(1900));
    assert.equal(await f.token.allowance(f.travelerA.address, f.address), 0n);
    await f.list();
    const sale = await run(f.travelerB, true);
    assert.deepEqual(sale.payout, { seller: thb(2660), hotel: thb(250), platform: thb(90) });
    assert.equal((await snapshot()).nights[0].holder, f.travelerB.address);
    assert.deepEqual(labels, ["Approve ฿2,000.00 MockTHB", "Book night #1", "Approve ฿3,000.00 MockTHB", "Buy resale #1"]);
    const history = await readBookingHistory(checked.market, f.deployBlock, sale.block);
    assert.equal(history.purchases.length, 2);
    assert.deepEqual(history.resales.get(1), { sales: 1n, volume: resale });
    assert.equal(parseTHB("2.11"), 211n);
    assert.equal(formatTHB(-100_001n), "−฿1,000.01");
  });

  it("stops multi-step checkout if the wallet changes after approval", async () => {
    await f.mint();
    const data = (await f.ethers.provider.getBlock("latest"))!;
    const { nights } = await readMarket(f.market, f.token, f.travelerA.address, data.number, BigInt(data.timestamp));
    let wallet = f.travelerA.address;
    const check = () => requireWalletContext({ send: async (method) => method === "eth_chainId" ? "0xaa36a7" : [wallet] }, f.travelerA.address);
    await assert.rejects(purchase(new Contract(f.address, marketAbi, f.travelerA), new Contract(f.tokenAddress, currencyAbi, f.travelerA),
      nights[0], false, f.travelerA.address, check, async (_label, tx) => {
        const receipt = await confirmed(tx);
        wallet = f.travelerB.address;
        return receipt;
      }), /wallet account or network changed/);
    assert.equal(await f.market.currentHolder(1), f.hotel.address);
    assert.equal(await f.token.allowance(f.travelerA.address, f.address), start);
    await assert.rejects(requireWalletContext({ send: async (method) => method === "eth_chainId" ? "0x1" : [f.travelerA.address] }, f.travelerA.address),
      /wallet account or network changed/);
    assert.throws(() => parseGuestProof("{}", nights[0], f.address, BigInt(data.timestamp)), /does not match/);
  });
});
