// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./HappyPassToken.sol";

/// @notice Hotel booking prototype. All payable amounts are in wei of test ETH.
contract StayCoinNightToken is ERC1155, Ownable, ReentrancyGuard {
    struct Hotel {
        string name;
        string city;
        uint32 rooms;
    }

    struct Night {
        address hotel;
        address holder;
        uint256 stayDate;
        uint256 originalPrice;
        uint256 lastPaidPrice;
        uint256 listingPrice;
        string roomType;
        bool redeemed;
    }

    enum Claim { None, Pending, Denied, Paid }

    struct Pass {
        HappyPassToken token;
        uint8 tier;
        uint64 starts;
        uint64 ends;
        uint256 price;
        uint256 committed;
        uint256 issued;
    }

    uint256 public constant VERSION = 2;
    uint256 public constant POINT_VALUE = 0.000001 ether;
    uint256 public constant POINT_EARN_UNIT = 0.0001 ether;
    uint256 public constant POINTS_LIFETIME = 540 days;
    uint256 public constant HOTEL_PROFIT_BPS = 2500;
    uint256 public constant PLATFORM_RESALE_BPS = 300;
    uint256 public constant PLATFORM_PRIMARY_BPS = 500;
    uint256 private constant BPS = 10000;
    uint256 private constant BANGKOK_OFFSET = 7 hours;

    string public constant symbol = "STAY";
    uint256 public nextNightId = 1;
    mapping(address => Hotel) public hotels;
    mapping(uint256 => Night) public nights;
    mapping(address => mapping(uint256 => uint256)) public issuedForDate;
    mapping(address => uint256) public proceeds;

    uint256 public nextPassId = 1;
    uint256 public rewardsReserve;
    mapping(uint256 => Pass) public happyPasses;
    mapping(uint256 => uint256) public passForNight;
    mapping(address => uint8) public hotelTier;
    mapping(address => uint256) public hotelBond;
    mapping(address => uint256) public hotelBondLocked;
    mapping(uint256 => uint256) public nightBond;
    mapping(uint256 => Claim) public bondClaims;
    mapping(address => uint256) private pointBalances;
    mapping(uint256 => uint256) private bookingPointsSpent;
    mapping(address => uint256) public pointsExpireAt;
    mapping(uint256 => uint256) public resaleCount;
    mapping(uint256 => uint256) public resaleVolume;

    event HappyPassCreated(uint256 indexed passId, address indexed token, uint8 tier);
    event NightCommitted(uint256 indexed passId, uint256 indexed nightId);
    event HappyPassPurchased(uint256 indexed passId, address indexed traveler);
    event HappyPassRedeemed(uint256 indexed passId, uint256 indexed nightId, address indexed traveler);
    event HappyPassRefunded(uint256 indexed passId, address indexed traveler);
    event HotelBondFunded(address indexed hotel, uint256 amount);
    event HotelBondReleased(uint256 indexed nightId);
    event BondClaimUpdated(uint256 indexed nightId, Claim status);
    event StayPointsEarned(address indexed traveler, uint256 points);
    event StayPointsSpent(address indexed traveler, uint256 points);

    event HotelRegistered(address indexed hotel, string name, string city, uint32 rooms);
    event NightCreated(uint256 indexed id, address indexed hotel, uint256 stayDate, uint256 priceWei);
    event PrimaryPurchased(uint256 indexed id, address indexed traveler, uint256 priceWei);
    event NightListed(uint256 indexed id, uint256 priceWei);
    event Resold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 priceWei, uint256 hotelShare, uint256 fee);
    event CheckedIn(uint256 indexed id, address indexed traveler);
    event ProceedsWithdrawn(address indexed account, address indexed recipient, uint256 amount);

    constructor() ERC1155("") Ownable(msg.sender) {
        // Local development and class deployment only.
        require(block.chainid == 31337 || block.chainid == 11155111, "Unsupported chain");
    }

    function registerHotel(address account, string calldata name, string calldata city, uint32 rooms)
        external onlyOwner
    {
        require(account != address(0) && hotels[account].rooms == 0, "Invalid or registered hotel");
        require(rooms >= 5, "At least five rooms required");
        require(bytes(name).length > 0 && bytes(name).length <= 80, "Invalid hotel name");
        require(bytes(city).length > 0 && bytes(city).length <= 48, "Invalid city");
        hotels[account] = Hotel(name, city, rooms);
        emit HotelRegistered(account, name, city, rooms);
    }

    function createNight(uint256 stayDate, string calldata roomType, uint256 priceWei)
        external nonReentrant returns (uint256 id)
    {
        uint32 rooms = hotels[msg.sender].rooms;
        require(rooms != 0, "Only registered hotels");
        require(stayDate > block.timestamp && (stayDate + BANGKOK_OFFSET) % 1 days == 0, "Use future Bangkok midnight");
        require(bytes(roomType).length > 0 && bytes(roomType).length <= 64, "Invalid room type");
        require(priceWei > 0, "Price required");
        require(issuedForDate[msg.sender][stayDate] < rooms / 5, "20 percent inventory cap reached");
        issuedForDate[msg.sender][stayDate]++;
        id = nextNightId++;
        nights[id] = Night(msg.sender, msg.sender, stayDate, priceWei, 0, 0, roomType, false);
        _mint(msg.sender, id, 1, "");
        emit NightCreated(id, msg.sender, stayDate, priceWei);
    }

    function buyNight(uint256 id) external payable nonReentrant {
        _buyNight(id, 0);
    }

    function buyNightWithPoints(uint256 id, uint256 points) external payable nonReentrant {
        require(points > 0, "Choose points");
        _buyNight(id, points);
    }

    function pointBalance(address guest) public view returns (uint256) {
        return block.timestamp < pointsExpireAt[guest] ? pointBalances[guest] : 0;
    }

    function fundRewards() external payable onlyOwner {
        require(msg.value > 0, "Amount required");
        rewardsReserve += msg.value;
    }

    function _buyNight(uint256 id, uint256 points) private {
        Night storage night = nights[id];
        require(night.hotel != address(0), "Unknown night");
        require(block.timestamp < night.stayDate, "Night expired");
        require(night.lastPaidPrice == 0 && !night.redeemed && passForNight[id] == 0, "Not available");
        require(msg.sender != night.hotel, "Hotel cannot buy own night");
        require(points <= pointBalance(msg.sender) && points <= night.originalPrice / 5 / POINT_VALUE, "Points exceed limit");
        uint256 discount = points * POINT_VALUE;
        require(discount <= rewardsReserve, "Rewards reserve too low");
        require(msg.value == night.originalPrice - discount, "Incorrect test ETH payment");
        if (points > 0) {
            pointBalances[msg.sender] -= points;
            pointsExpireAt[msg.sender] = block.timestamp + POINTS_LIFETIME;
            rewardsReserve -= discount;
            bookingPointsSpent[id] = points;
            emit StayPointsSpent(msg.sender, points);
        }
        _primarySale(id, msg.sender, msg.value, night.originalPrice);
    }

    function _primarySale(uint256 id, address guest, uint256 paid, uint256 gross) private {
        Night storage night = nights[id];
        night.holder = guest;
        night.lastPaidPrice = paid;
        uint256 fee = gross * PLATFORM_PRIMARY_BPS / BPS;
        proceeds[owner()] += fee;
        proceeds[night.hotel] += gross - fee;
        _safeTransferFrom(night.hotel, guest, id, 1, "");
        emit PrimaryPurchased(id, guest, paid);
    }

    function listForResale(uint256 id, uint256 priceWei) external nonReentrant {
        Night storage night = nights[id];
        require(night.lastPaidPrice > 0 && !night.redeemed && block.timestamp < night.stayDate, "Not resale eligible");
        require(night.holder == msg.sender, "Not holder");
        require(priceWei > 0, "Price required");
        night.listingPrice = priceWei;
        emit NightListed(id, priceWei);
    }

    function cancelListing(uint256 id) external nonReentrant {
        Night storage night = nights[id];
        require(night.holder == msg.sender && night.listingPrice > 0, "No owned listing");
        night.listingPrice = 0;
        emit NightListed(id, 0);
    }

    function buyResale(uint256 id, address seller) external payable nonReentrant {
        Night storage night = nights[id];
        require(night.lastPaidPrice > 0 && !night.redeemed && block.timestamp < night.stayDate, "Not resale eligible");
        require(night.listingPrice > 0 && msg.value == night.listingPrice, "Incorrect listed price");
        require(night.holder == seller && msg.sender != seller, "Invalid seller");

        uint256 profit = msg.value > night.lastPaidPrice ? msg.value - night.lastPaidPrice : 0;
        uint256 hotelShare = profit * HOTEL_PROFIT_BPS / BPS;
        uint256 fee = msg.value * PLATFORM_RESALE_BPS / BPS;
        night.listingPrice = 0;
        night.lastPaidPrice = msg.value;
        delete bookingPointsSpent[id];
        night.holder = msg.sender;
        proceeds[night.hotel] += hotelShare;
        proceeds[owner()] += fee;
        proceeds[seller] += msg.value - hotelShare - fee;
        _safeTransferFrom(seller, msg.sender, id, 1, "");
        resaleCount[id]++;
        resaleVolume[id] += msg.value;
        emit Resold(id, seller, msg.sender, msg.value, hotelShare, fee);
    }

    function checkIn(uint256 id, address traveler) external nonReentrant {
        Night storage night = nights[id];
        require(msg.sender == night.hotel, "Only hotel");
        require(night.lastPaidPrice > 0 && !night.redeemed, "Not redeemable");
        require(block.timestamp >= night.stayDate && block.timestamp < night.stayDate + 1 days, "Outside check-in day");
        require(night.holder == traveler && balanceOf(traveler, id) == 1, "Traveler not holder");
        require(bondClaims[id] != Claim.Pending, "Bond claim pending");
        night.redeemed = true;
        night.listingPrice = 0;
        _burn(traveler, id, 1);
        _unlockBond(id, night.hotel);
        uint256 points = night.lastPaidPrice / POINT_EARN_UNIT;
        _creditPoints(traveler, points);
        delete bookingPointsSpent[id];
        emit CheckedIn(id, traveler);
    }

    function _creditPoints(address account, uint256 points) private {
        if (points == 0) return;
        pointBalances[account] = pointBalance(account) + points;
        pointsExpireAt[account] = block.timestamp + POINTS_LIFETIME;
        emit StayPointsEarned(account, points);
    }

    function createHappyPass(uint8 tier, uint64 starts, uint64 ends, uint256 price)
        external onlyOwner returns (uint256 id)
    {
        require(tier >= 2 && tier <= 5 && price > 0, "Invalid tier or price");
        require(starts > block.timestamp && ends > starts && ends <= starts + 180 days, "Invalid season dates");
        require((uint256(starts) + BANGKOK_OFFSET) % 1 days == 0 &&
            (uint256(ends) + BANGKOK_OFFSET) % 1 days == 0, "Use Bangkok midnight");
        id = nextPassId++;
        HappyPassToken token = new HappyPassToken(ends);
        happyPasses[id] = Pass(token, tier, starts, ends, price, 0, 0);
        emit HappyPassCreated(id, address(token), tier);
    }

    function setHotelTier(address hotel, uint8 tier) external onlyOwner {
        require(hotels[hotel].rooms > 0 && hotelTier[hotel] == 0 && tier >= 2 && tier <= 5, "Invalid hotel or tier");
        hotelTier[hotel] = tier;
    }

    function commitHappyNight(uint256 passId, uint256 nightId) external {
        Pass storage pass = happyPasses[passId];
        Night storage night = nights[nightId];
        require(address(pass.token) != address(0) && block.timestamp < pass.starts, "Pass presale closed");
        require(night.hotel == msg.sender && night.lastPaidPrice == 0 && passForNight[nightId] == 0, "Night unavailable");
        require(hotelTier[msg.sender] == pass.tier, "Hotel tier mismatch");
        require(night.stayDate >= pass.starts && night.stayDate < pass.ends, "Night outside season");
        require(pass.price <= night.originalPrice * 70 / 100, "Pass must be at least 30 percent cheaper");
        passForNight[nightId] = passId;
        pass.committed++;
        emit NightCommitted(passId, nightId);
    }

    function releaseHappyNight(uint256 nightId) external {
        uint256 passId = passForNight[nightId];
        Pass storage pass = happyPasses[passId];
        Night storage night = nights[nightId];
        require(passId != 0 && night.hotel == msg.sender && block.timestamp < pass.starts &&
            night.lastPaidPrice == 0 && pass.committed > pass.issued, "Night reserved for pass holders");
        delete passForNight[nightId];
        pass.committed--;
        emit NightCommitted(0, nightId);
    }

    function buyHappyPass(uint256 passId) external payable nonReentrant {
        Pass storage pass = happyPasses[passId];
        require(block.timestamp < pass.starts && pass.issued < pass.committed, "Pass unavailable");
        require(msg.value == pass.price, "Incorrect test ETH payment");
        pass.issued++;
        pass.token.issue(msg.sender);
        emit HappyPassPurchased(passId, msg.sender);
    }

    function redeemHappyPass(uint256 passId, uint256 nightId) external nonReentrant {
        Pass storage pass = happyPasses[passId];
        Night storage night = nights[nightId];
        require(passId != 0 && passForNight[nightId] == passId && night.lastPaidPrice == 0, "Night unavailable");
        require(block.timestamp < night.stayDate && msg.sender != night.hotel, "Night unavailable");
        pass.token.consume(msg.sender);
        _primarySale(nightId, msg.sender, pass.price, pass.price);
        emit HappyPassRedeemed(passId, nightId, msg.sender);
    }

    function refundExpiredPass(uint256 passId) external nonReentrant {
        Pass storage pass = happyPasses[passId];
        require(address(pass.token) != address(0) && block.timestamp >= pass.ends, "Pass has not ended");
        pass.token.consume(msg.sender);
        proceeds[msg.sender] += pass.price;
        emit HappyPassRefunded(passId, msg.sender);
    }

    function depositHotelBond() external payable {
        require(hotels[msg.sender].rooms > 0 && msg.value > 0, "Hotel and amount required");
        hotelBond[msg.sender] += msg.value;
        emit HotelBondFunded(msg.sender, msg.value);
    }

    function withdrawHotelBond(uint256 amount) external {
        require(amount > 0 && amount <= hotelBond[msg.sender] - hotelBondLocked[msg.sender], "Bond unavailable");
        hotelBond[msg.sender] -= amount;
        proceeds[msg.sender] += amount;
    }

    function protectNight(uint256 id) external {
        Night storage night = nights[id];
        require(night.hotel == msg.sender && night.lastPaidPrice == 0 && block.timestamp < night.stayDate &&
            nightBond[id] == 0, "Night not eligible for protection");
        uint256 amount = night.originalPrice;
        require(amount <= hotelBond[msg.sender] - hotelBondLocked[msg.sender], "Bond available is too low");
        hotelBondLocked[msg.sender] += amount;
        nightBond[id] = amount;
    }

    function nightFeatures(uint256 id) external view returns (
        uint256 passId, uint256 coverage, Claim claim, uint256 sales, uint256 volume
    ) {
        return (passForNight[id], nightBond[id], bondClaims[id], resaleCount[id], resaleVolume[id]);
    }

    function releaseNightBond(uint256 id) external {
        Night storage night = nights[id];
        require(night.hotel == msg.sender && nightBond[id] > 0 && bondClaims[id] != Claim.Pending &&
            block.timestamp >= night.stayDate + 2 days, "Bond still locked");
        _unlockBond(id, night.hotel);
    }

    function requestBondRefund(uint256 id) external {
        Night storage night = nights[id];
        require(msg.sender == night.holder && night.lastPaidPrice > 0 && !night.redeemed && nightBond[id] > 0 &&
            bondClaims[id] == Claim.None && block.timestamp >= night.stayDate && block.timestamp < night.stayDate + 2 days,
            "Night not eligible for a claim");
        bondClaims[id] = Claim.Pending;
        emit BondClaimUpdated(id, Claim.Pending);
    }

    function resolveBondClaim(uint256 id, bool approved) external onlyOwner nonReentrant {
        require(approved || block.timestamp < nights[id].stayDate + 7 days, "Review window ended");
        _resolveBondClaim(id, approved);
    }

    function claimTimedOutBond(uint256 id) external nonReentrant {
        require(msg.sender == nights[id].holder && block.timestamp >= nights[id].stayDate + 7 days, "Review window is open");
        _resolveBondClaim(id, true);
    }

    function _resolveBondClaim(uint256 id, bool approved) private {
        require(bondClaims[id] == Claim.Pending, "No pending claim");
        if (approved) {
            Night storage night = nights[id];
            uint256 refund = night.lastPaidPrice < nightBond[id] ? night.lastPaidPrice : nightBond[id];
            _unlockBond(id, night.hotel);
            uint256 restoredPoints = bookingPointsSpent[id];
            uint256 restoredReserve = restoredPoints * POINT_VALUE;
            delete bookingPointsSpent[id];
            hotelBond[night.hotel] -= refund + restoredReserve;
            rewardsReserve += restoredReserve;
            _creditPoints(night.holder, restoredPoints);
            proceeds[night.holder] += refund;
            night.redeemed = true;
            night.listingPrice = 0;
            _burn(night.holder, id, 1);
        }
        bondClaims[id] = approved ? Claim.Paid : Claim.Denied;
        emit BondClaimUpdated(id, bondClaims[id]);
    }

    function _unlockBond(uint256 id, address hotel) private {
        uint256 amount = nightBond[id];
        if (amount == 0) return;
        hotelBondLocked[hotel] -= amount;
        nightBond[id] = 0;
        emit HotelBondReleased(id);
    }

    function withdrawProceeds(address payable recipient) external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        require(amount > 0 && recipient != address(0), "No proceeds or invalid recipient");
        proceeds[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "Test ETH payout failed");
        emit ProceedsWithdrawn(msg.sender, recipient, amount);
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert("Use marketplace transfer");
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory)
        public pure override
    {
        revert("Use marketplace transfer");
    }

    // Keep a valid fee recipient for future sales.
    function renounceOwnership() public pure override {
        revert("Platform owner required");
    }
}
