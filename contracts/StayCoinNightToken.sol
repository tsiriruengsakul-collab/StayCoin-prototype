// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
        Night storage night = nights[id];
        require(night.hotel != address(0), "Unknown night");
        require(block.timestamp < night.stayDate, "Night expired");
        require(night.lastPaidPrice == 0 && !night.redeemed, "Not available");
        require(msg.sender != night.hotel, "Hotel cannot buy own night");
        require(msg.value == night.originalPrice, "Incorrect test ETH payment");

        night.holder = msg.sender;
        night.lastPaidPrice = msg.value;
        uint256 fee = msg.value * PLATFORM_PRIMARY_BPS / BPS;
        proceeds[owner()] += fee;
        proceeds[night.hotel] += msg.value - fee;
        _safeTransferFrom(night.hotel, msg.sender, id, 1, "");
        emit PrimaryPurchased(id, msg.sender, msg.value);
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
        night.holder = msg.sender;
        proceeds[night.hotel] += hotelShare;
        proceeds[owner()] += fee;
        proceeds[seller] += msg.value - hotelShare - fee;
        _safeTransferFrom(seller, msg.sender, id, 1, "");
        emit Resold(id, seller, msg.sender, msg.value, hotelShare, fee);
    }

    function checkIn(uint256 id, address traveler) external nonReentrant {
        Night storage night = nights[id];
        require(msg.sender == night.hotel, "Only hotel");
        require(night.lastPaidPrice > 0 && !night.redeemed, "Not redeemable");
        require(block.timestamp >= night.stayDate && block.timestamp < night.stayDate + 1 days, "Outside check-in day");
        require(night.holder == traveler && balanceOf(traveler, id) == 1, "Traveler not holder");
        night.redeemed = true;
        night.listingPrice = 0;
        _burn(traveler, id, 1);
        emit CheckedIn(id, traveler);
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
