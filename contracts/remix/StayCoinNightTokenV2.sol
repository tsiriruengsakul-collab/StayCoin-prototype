// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * StayCoin Night Token V2 - EDUCATIONAL TESTNET DEMO ONLY.
 * Not audited. Not suitable for real guest deposits or hotel liabilities.
 * Payments use Sepolia TEST ETH, not baht, STAY ERC-20 or MockTHB.
 *
 * Main features:
 *  - Owner-approved hotels and verified room counts.
 *  - Unique ERC-1155 token (quantity 1) for each hotel night.
 *  - 20% daily hotel inventory cap.
 *  - Primary sale with 5% platform commission and 10% hotel bond holdback.
 *  - Holder-authorized listing/cancellation and enforced on-chain resales.
 *  - Resale splits: 3% platform + 25% of positive resale profit to hotel.
 *  - Hotel-verified check-in burns the token and releases the held bond.
 *  - Expiry burns unused tokens; no purchases/resales after stayDate.
 *  - Claimable ETH payouts to avoid reverting because a payee cannot receive ETH.
 *
 * Scope: Green Season Pass, baht stablecoin and cross-hotel escrow allocation,
 * and nontransferable StayPoints are separate products, NOT implemented here.
 */

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract StayCoinNightTokenV2 is ERC1155, Ownable, ReentrancyGuard {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant HOTEL_PROFIT_BPS = 2_500;     // 25% positive resale profit
    uint256 public constant PLATFORM_RESALE_BPS = 300;  // 3% resale price
    uint256 public constant PLATFORM_PRIMARY_BPS = 500; // 5% primary price
    uint256 public constant HOTEL_BOND_BPS = 1_000;     // 10% primary price

    struct Night {
        address hotel;
        uint256 stayDate;
        uint256 originalPrice;
        uint256 lastPaidPrice;
        uint256 listingPrice;
        bool sold;
        bool redeemed;
        address listingSeller;
        bool expired;
    }

    struct Hotel {
        bool approved;
        uint256 verifiedRooms;
    }

    uint256 public nextNightId = 1;
    mapping(uint256 => Night) public nights;
    mapping(address => Hotel) public hotels;
    mapping(bytes32 => uint256) public issuedForDate;
    mapping(uint256 => uint256) public bondHeld;
    mapping(address => uint256) public pendingWithdrawals;

    // Each privileged transfer is restricted to an EXACT from/to/id movement.
    // A plain boolean guard would be unsafe during ERC-1155 receiver callbacks.
    bool private _movementAllowed;
    address private _expectedFrom;
    address private _expectedTo;
    uint256 private _expectedId;
    mapping(uint256 => address) private _recordedHolder;
    mapping(uint256 => address) public expiredHolder;

    event HotelUpdated(address indexed hotel, bool approved, uint256 verifiedRooms);
    event NightCreated(uint256 indexed id, address indexed hotel, uint256 stayDate, uint256 priceWei);
    event PrimaryPurchased(uint256 indexed id, address indexed traveler, uint256 priceWei);
    event NightListed(uint256 indexed id, uint256 priceWei);
    event NightListingCancelled(uint256 indexed id);
    event Resold(
        uint256 indexed id,
        address indexed seller,
        address indexed buyer,
        uint256 priceWei,
        uint256 hotelShare,
        uint256 fee
    );
    event CheckedIn(uint256 indexed id, address indexed traveler);
    event NightExpired(uint256 indexed id, address indexed finalHolder);
    event BondReserved(uint256 indexed id, uint256 amountWei);
    event BondReleased(uint256 indexed id, address indexed hotel, uint256 amountWei);
    event Withdrawal(address indexed account, uint256 amountWei);

    constructor() ERC1155("") Ownable(msg.sender) {}

    /** Admin verification is a DEMO stand-in for real-world hotel KYC/onboarding. */
    function registerHotel(address hotel, uint256 verifiedRooms) external onlyOwner {
        require(hotel != address(0), "Zero hotel address");
        require(verifiedRooms >= 5, "Hotel must have 5+ rooms");
        // We disallow downward adjustments to keep prior inventory allocations valid.
        require(verifiedRooms >= hotels[hotel].verifiedRooms, "Cannot reduce verified rooms");
        hotels[hotel] = Hotel(true, verifiedRooms);
        emit HotelUpdated(hotel, true, verifiedRooms);
    }

    function suspendHotel(address hotel) external onlyOwner {
        Hotel storage h = hotels[hotel];
        require(h.approved, "Hotel not active");
        h.approved = false;
        emit HotelUpdated(hotel, false, h.verifiedRooms);
        // Existing guest tokens stay redeemable; only new issuance is blocked.
    }

    /** Hotel creates one booking token, initially held by the hotel wallet.
     * hotelRooms is retained for compatibility with the original frontend ABI.
     * It MUST match the count previously approved by the platform owner.
     */
    function createNight(uint256 stayDate, uint256 hotelRooms, uint256 priceWei)
        external nonReentrant
        returns (uint256 id)
    {
        Hotel memory h = hotels[msg.sender];
        require(h.approved, "Hotel not approved");
        require(hotelRooms == h.verifiedRooms, "Use approved room count");
        require(stayDate > block.timestamp, "Stay must be future");
        require(priceWei > 0, "Price required");

        bytes32 key = keccak256(abi.encode(msg.sender, stayDate));
        uint256 maxTokens = h.verifiedRooms / 5; // floor(20% of verified rooms)
        require(issuedForDate[key] < maxTokens, "20 percent cap reached");

        issuedForDate[key] += 1;
        id = nextNightId++;
        nights[id] = Night({
            hotel: msg.sender,
            stayDate: stayDate,
            originalPrice: priceWei,
            lastPaidPrice: 0,
            listingPrice: 0,
            sold: false,
            redeemed: false,
            listingSeller: address(0),
            expired: false
        });

        _permitMovement(address(0), msg.sender, id);
        _mint(msg.sender, id, 1, "");
        _clearMovement();
        emit NightCreated(id, msg.sender, stayDate, priceWei);
    }

    /** Buyer pays EXACTLY the original amount of TEST ETH. */
    function buyNight(uint256 id) external payable nonReentrant {
        Night storage n = nights[id];
        require(n.hotel != address(0), "Unknown night");
        require(block.timestamp < n.stayDate, "Night expired");
        require(!n.sold && !n.redeemed && !n.expired, "Not available");
        require(msg.sender != n.hotel, "Hotel cannot buy own night");
        require(msg.value == n.originalPrice, "Incorrect test ETH payment");
        require(balanceOf(n.hotel, id) == 1, "Hotel not holding token");

        n.sold = true;
        n.lastPaidPrice = msg.value;
        _recordedHolder[id] = msg.sender;

        // 5% fee + 10% held bond + 85% payable to hotel.
        uint256 fee = (msg.value * PLATFORM_PRIMARY_BPS) / BASIS_POINTS;
        uint256 bond = (msg.value * HOTEL_BOND_BPS) / BASIS_POINTS;
        bondHeld[id] = bond;
        pendingWithdrawals[owner()] += fee;
        pendingWithdrawals[n.hotel] += msg.value - fee - bond;

        _permitMovement(n.hotel, msg.sender, id);
        _safeTransferFrom(n.hotel, msg.sender, id, 1, "");
        _clearMovement();
        emit BondReserved(id, bond);
        emit PrimaryPurchased(id, msg.sender, msg.value);
    }

    /** Booking holder lists a token. Transfers to anyone else are blocked. */
    function listForResale(uint256 id, uint256 newPriceWei) external {
        Night storage n = nights[id];
        require(n.sold && !n.redeemed && !n.expired, "Not resale eligible");
        require(block.timestamp < n.stayDate, "Night expired");
        require(balanceOf(msg.sender, id) == 1, "Not holder");
        require(newPriceWei > 0, "Price required");

        n.listingPrice = newPriceWei;
        n.listingSeller = msg.sender;
        emit NightListed(id, newPriceWei);
    }

    function cancelListing(uint256 id) external {
        Night storage n = nights[id];
        require(balanceOf(msg.sender, id) == 1, "Not holder");
        require(n.listingPrice > 0, "Not listed");
        n.listingPrice = 0;
        n.listingSeller = address(0);
        emit NightListingCancelled(id);
    }

    /** Frontend may call this before submitting buyResale. */
    function quoteResale(uint256 id)
        external
        view
        returns (uint256 sellerReceives, uint256 hotelReceives, uint256 platformReceives)
    {
        Night storage n = nights[id];
        require(n.listingPrice > 0, "Not listed");
        return _resaleSplit(n.listingPrice, n.lastPaidPrice);
    }

    /** The seller address is intentionally retained for compatibility with V1. */
    function buyResale(uint256 id, address seller) external payable nonReentrant {
        Night storage n = nights[id];
        require(n.sold && !n.redeemed && !n.expired, "Not resale eligible");
        require(block.timestamp < n.stayDate, "Night expired");
        require(n.listingPrice > 0 && msg.value == n.listingPrice, "Incorrect listed price");
        require(seller == n.listingSeller && seller != address(0), "Wrong listing seller");
        require(balanceOf(seller, id) == 1 && msg.sender != seller, "Invalid buyer/seller");
        require(msg.sender != n.hotel, "Hotel cannot buy own night");

        (uint256 sellerAmount, uint256 hotelShare, uint256 fee) =
            _resaleSplit(msg.value, n.lastPaidPrice);

        n.listingPrice = 0;
        n.listingSeller = address(0);
        n.lastPaidPrice = msg.value;
        _recordedHolder[id] = msg.sender;
        pendingWithdrawals[seller] += sellerAmount;
        pendingWithdrawals[n.hotel] += hotelShare;
        pendingWithdrawals[owner()] += fee;

        _permitMovement(seller, msg.sender, id);
        _safeTransferFrom(seller, msg.sender, id, 1, "");
        _clearMovement();
        emit Resold(id, seller, msg.sender, msg.value, hotelShare, fee);
    }

    /** Hotel physically verifies arrival, then burns the holder's booking token.
     * For a classroom demo this does not check the calendar day (hotel confirms
     * check-in off-chain); production would need an agreed time-window policy.
     */
    function checkIn(uint256 id, address traveler) external nonReentrant {
        Night storage n = nights[id];
        require(msg.sender == n.hotel, "Only issuing hotel");
        require(n.sold && !n.redeemed && !n.expired, "Not redeemable");
        require(balanceOf(traveler, id) == 1, "Traveler not holder");

        n.redeemed = true;
        _recordedHolder[id] = address(0);
        n.listingPrice = 0;
        n.listingSeller = address(0);
        _permitMovement(traveler, address(0), id);
        _burn(traveler, id, 1);
        _clearMovement();

        // In the educational demo the held 10% is released at check-in,
        // not after check-out as assumed in the financial plan.
        uint256 bond = bondHeld[id];
        bondHeld[id] = 0;
        pendingWithdrawals[n.hotel] += bond;
        emit BondReleased(id, n.hotel, bond);
        emit CheckedIn(id, traveler);
    }

    /** Anyone may clean up expired tokens once their stay date has passed.
     * The bond remains locked pending a separate hotel-fulfillment/refund policy.
     */
    function expireNight(uint256 id) external nonReentrant {
        Night storage n = nights[id];
        require(n.hotel != address(0), "Unknown night");
        require(block.timestamp >= n.stayDate, "Stay not expired");
        require(!n.redeemed && !n.expired, "Already finalized");

        address holder = n.sold ? _currentHolderForExpiry(id, n) : n.hotel;
        require(holder != address(0) && balanceOf(holder, id) == 1, "Holder required");
        n.expired = true;
        expiredHolder[id] = holder;
        _recordedHolder[id] = address(0);
        n.listingPrice = 0;
        n.listingSeller = address(0);
        _permitMovement(holder, address(0), id);
        _burn(holder, id, 1);
        _clearMovement();
        emit NightExpired(id, holder);
    }

    /** Payouts are claimable rather than sent during purchases.
     * Every hotel/seller/platform wallet clicks withdraw() for its balance.
     */
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "Withdraw failed");
        emit Withdrawal(msg.sender, amount);
    }

    function _resaleSplit(uint256 newPrice, uint256 lastPaidPrice)
        internal
        pure
        returns (uint256 sellerAmount, uint256 hotelShare, uint256 fee)
    {
        uint256 profit = newPrice > lastPaidPrice ? newPrice - lastPaidPrice : 0;
        hotelShare = (profit * HOTEL_PROFIT_BPS) / BASIS_POINTS;
        fee = (newPrice * PLATFORM_RESALE_BPS) / BASIS_POINTS;
        require(hotelShare + fee <= newPrice, "Invalid payout");
        sellerAmount = newPrice - hotelShare - fee;
    }

    event ExpiredBondSettled(uint256 indexed id, address indexed recipient, uint256 amountWei);

    /** Demo dispute resolution: after a stay expires without redemption, platform
     * owner can direct the 10% held bond to the last holder or the hotel.
     * This is ONLY a partial protection, not a full-price refund mechanism.
     */
    function settleExpiredBond(uint256 id, address recipient) external onlyOwner {
        Night storage n = nights[id];
        require(n.expired, "Booking not expired");
        require(recipient == n.hotel || recipient == expiredHolder[id], "Invalid recipient");
        uint256 bond = bondHeld[id];
        require(bond > 0, "No bond available");
        bondHeld[id] = 0;
        pendingWithdrawals[recipient] += bond;
        emit ExpiredBondSettled(id, recipient, bond);
    }

    function _permitMovement(address from, address to, uint256 id) private {
        require(!_movementAllowed, "Nested movement");
        _movementAllowed = true;
        _expectedFrom = from;
        _expectedTo = to;
        _expectedId = id;
    }

    function _clearMovement() private {
        _movementAllowed = false;
        _expectedFrom = address(0);
        _expectedTo = address(0);
        _expectedId = 0;
    }

    /** ERC-1155 transfers are restricted to their exact authorized step. */
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        require(
            _movementAllowed && from == _expectedFrom && to == _expectedTo &&
            ids.length == 1 && values.length == 1 &&
            ids[0] == _expectedId && values[0] == 1,
            "Use StayCoin booking functions"
        );
        super._update(from, to, ids, values);
    }

    function _currentHolderForExpiry(uint256 id, Night storage n) internal view returns (address) {
        address recorded = _recordedHolder[id];
        if (recorded != address(0)) return recorded;
        return n.hotel;
    }

    function currentHolder(uint256 id) external view returns (address) {
        Night storage n = nights[id];
        require(n.hotel != address(0), "Unknown night");
        if (n.redeemed || n.expired) return address(0);
        if (_recordedHolder[id] != address(0)) return _recordedHolder[id];
        return n.hotel;
    }
}
