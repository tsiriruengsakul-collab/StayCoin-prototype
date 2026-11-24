// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Sepolia classroom MVP. Hotel inventory is approved off-chain.
contract StayCoinNightTokenV3 is ERC1155, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BANGKOK_OFFSET = 7 hours;
    uint256 private constant BPS = 10_000;
    bytes32 private constant DOMAIN_TYPE = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 private constant CHECK_IN_TYPE = keccak256(
        "CheckIn(uint256 tokenId,address hotel,address holder,uint256 nonce,uint256 deadline)"
    );

    struct Hotel {
        bool approved;
        uint256 verifiedRooms;
        string name;
    }

    struct Night {
        address hotel;
        address holder;
        uint256 stayDate;
        uint256 originalPrice;
        uint256 lastPaidPrice;
        uint256 listingPrice;
        uint256 nonce;
        bool sold;
        bool redeemed;
        bool expired;
        string roomCategory;
    }

    IERC20 public paymentToken;
    uint256 public nextNightId = 1;
    mapping(uint256 => Night) public nights;
    mapping(address => Hotel) public hotels;
    mapping(address => mapping(uint256 => uint256)) public issuedForDate;
    mapping(uint256 => address) public expiredHolder;

    event HotelUpdated(address indexed hotel, bool approved, uint256 verifiedRooms);
    event NightCreated(uint256 indexed id, address indexed hotel, uint256 stayDate, uint256 price);
    event NightListed(uint256 indexed id, uint256 price);
    event NightListingCancelled(uint256 indexed id);
    event PrimaryPurchased(uint256 indexed id, address indexed buyer, uint256 price, uint256 hotelAmount, uint256 platformAmount, address platform);
    event Resold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price, uint256 sellerAmount,
        uint256 hotelAmount, uint256 platformAmount, address platform);
    event CheckedIn(uint256 indexed id, address indexed traveler);
    event NightExpired(uint256 indexed id, address indexed finalHolder);

    constructor(address mockTHB) ERC1155("") Ownable(msg.sender) {
        require(block.chainid == 11155111 || block.chainid == 31337, "Sepolia or local only");
        require(mockTHB.code.length != 0 && IERC20Metadata(mockTHB).decimals() == 2, "Two-decimal MockTHB required");
        paymentToken = IERC20(mockTHB);
    }

    function registerHotel(address hotel, uint256 verifiedRooms, string calldata name) external onlyOwner {
        require(hotel != address(0), "Zero hotel address");
        require(verifiedRooms >= 5 && verifiedRooms >= hotels[hotel].verifiedRooms, "Invalid room count");
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Invalid hotel label");
        hotels[hotel] = Hotel(true, verifiedRooms, name);
        emit HotelUpdated(hotel, true, verifiedRooms);
    }

    function suspendHotel(address hotel) external onlyOwner {
        Hotel storage entry = hotels[hotel];
        require(entry.approved, "Hotel not active");
        entry.approved = false;
        emit HotelUpdated(hotel, false, entry.verifiedRooms);
    }

    function createNight(uint256 stayDate, uint256 price, string calldata roomCategory) external nonReentrant returns (uint256 id) {
        Hotel storage entry = hotels[msg.sender];
        require(entry.approved, "Hotel not approved");
        require(stayDate > block.timestamp, "Stay must be future");
        require(stayDate <= block.timestamp + 730 days, "Stay must be within two years");
        require(stayDate % 1 days == 1 days - BANGKOK_OFFSET, "Use Bangkok midnight");
        require(price != 0, "Price required");
        require(bytes(roomCategory).length > 0 && bytes(roomCategory).length <= 48, "Invalid room category");
        uint256 issued = issuedForDate[msg.sender][stayDate];
        require(issued < entry.verifiedRooms / 5, "20 percent cap reached");
        issuedForDate[msg.sender][stayDate] = issued + 1;
        id = nextNightId++;
        Night storage night = nights[id];
        night.hotel = msg.sender;
        night.holder = msg.sender;
        night.stayDate = stayDate;
        night.originalPrice = price;
        night.roomCategory = roomCategory;
        _mint(msg.sender, id, 1, "");
        emit NightCreated(id, msg.sender, stayDate, price);
    }

    function buyNight(uint256 id, uint256 expectedPrice) external nonReentrant {
        Night storage night = nights[id];
        require(night.hotel != address(0) && !night.sold && !night.redeemed && !night.expired, "Not available");
        require(block.timestamp < night.stayDate, "Night expired");
        address hotel = night.hotel;
        require(msg.sender != hotel, "Hotel cannot buy own night");
        uint256 price = night.originalPrice;
        require(expectedPrice == price, "Price changed");
        uint256 fee = Math.mulDiv(price, 500, BPS);
        night.sold = true;
        night.lastPaidPrice = price;
        night.holder = msg.sender;
        night.nonce++;
        _pay(hotel, price - fee);
        address platform = owner();
        _pay(platform, fee);
        _safeTransferFrom(hotel, msg.sender, id, 1, "");
        emit PrimaryPurchased(id, msg.sender, price, price - fee, fee, platform);
    }

    function listForResale(uint256 id, uint256 price) external nonReentrant {
        Night storage night = nights[id];
        _requireResaleOpen(night);
        require(night.holder == msg.sender, "Not holder");
        require(price > 0, "Price required");
        night.listingPrice = price;
        emit NightListed(id, price);
    }

    function cancelListing(uint256 id) external nonReentrant {
        Night storage night = nights[id];
        require(night.holder == msg.sender, "Not holder");
        require(night.listingPrice > 0, "Not listed");
        night.listingPrice = 0;
        emit NightListingCancelled(id);
    }

    function quoteResale(uint256 id) public view returns (uint256 sellerReceives, uint256 hotelReceives, uint256 platformReceives) {
        Night storage night = nights[id];
        _requireResaleOpen(night);
        uint256 price = night.listingPrice;
        require(price > 0, "Not listed");
        uint256 markup = price > night.originalPrice ? price - night.originalPrice : 0;
        hotelReceives = Math.mulDiv(markup, 2_500, BPS);
        platformReceives = Math.mulDiv(price, 300, BPS);
        sellerReceives = price - hotelReceives - platformReceives;
    }

    function buyResale(uint256 id, address expectedSeller, uint256 expectedPrice) external nonReentrant {
        (uint256 sellerAmount, uint256 hotelAmount, uint256 platformAmount) = quoteResale(id);
        Night storage night = nights[id];
        address seller = night.holder;
        require(seller == expectedSeller && night.listingPrice == expectedPrice, "Listing changed");
        require(msg.sender != seller && msg.sender != night.hotel, "Invalid buyer");
        night.listingPrice = 0;
        night.lastPaidPrice = expectedPrice;
        night.holder = msg.sender;
        night.nonce++;
        _pay(seller, sellerAmount);
        _pay(night.hotel, hotelAmount);
        address platform = owner();
        _pay(platform, platformAmount);
        _safeTransferFrom(seller, msg.sender, id, 1, "");
        emit Resold(id, seller, msg.sender, expectedPrice, sellerAmount, hotelAmount, platformAmount, platform);
    }

    function checkIn(uint256 id, address holder, uint256 nonce, uint256 deadline, bytes calldata signature) external nonReentrant {
        Night storage night = nights[id];
        require(msg.sender == night.hotel, "Only issuing hotel");
        require(night.sold && !night.redeemed && !night.expired, "Not redeemable");
        require(block.timestamp >= night.stayDate && block.timestamp < night.stayDate + 1 days, "Outside check-in day");
        require(night.holder == holder && balanceOf(holder, id) == 1 && nonce == night.nonce, "Booking holder changed");
        require(block.timestamp <= deadline && deadline <= night.stayDate + 1 days, "Invalid proof deadline");

        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPE, keccak256("StayCoin Night Token"), keccak256("3"), block.chainid, address(this)));
        bytes32 message = keccak256(abi.encode(CHECK_IN_TYPE, id, night.hotel, holder, nonce, deadline));
        require(SignatureChecker.isValidSignatureNow(holder, MessageHashUtils.toTypedDataHash(domain, message), signature), "Invalid guest signature");
        night.redeemed = true;
        night.holder = address(0);
        night.listingPrice = 0;
        night.nonce++;
        _burn(holder, id, 1);
        emit CheckedIn(id, holder);
    }

    function expireNight(uint256 id) external nonReentrant {
        Night storage night = nights[id];
        require(night.hotel != address(0) && !night.expired && !night.redeemed, "Already finalized or unknown");
        require(block.timestamp >= night.stayDate + 1 days, "Stay not expired");
        address holder = night.holder;
        night.expired = true;
        night.holder = address(0);
        night.listingPrice = 0;
        night.nonce++;
        expiredHolder[id] = holder;
        _burn(holder, id, 1);
        emit NightExpired(id, holder);
    }

    function currentHolder(uint256 id) external view returns (address) {
        return nights[id].holder;
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public pure override {
        revert("Use StayCoin marketplace");
    }

    function safeBatchTransferFrom(address, address, uint256[] memory, uint256[] memory, bytes memory) public pure override {
        revert("Use StayCoin marketplace");
    }

    function renounceOwnership() public pure override {
        revert("Platform owner required");
    }

    function _requireResaleOpen(Night storage night) private view {
        require(night.sold && !night.redeemed && !night.expired, "Not resale eligible");
        require(block.timestamp < night.stayDate, "Night expired");
    }

    function _pay(address recipient, uint256 amount) private {
        if (amount > 0) paymentToken.safeTransferFrom(msg.sender, recipient, amount);
    }
}
