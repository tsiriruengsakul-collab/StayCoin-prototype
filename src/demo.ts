import { dateKey } from "./chain";

export const today = () => dateKey(BigInt(Math.floor(Date.now() / 1000)));
function upcoming(days: number) {
  return dateKey(BigInt(Math.floor(Date.now() / 1000)) + BigInt(days * 86400));
}

export const sampleHotels = [
  { id: 1, name: "The Tide House", city: "Phuket", area: "Kata Beach", room: "Ocean-view king", guests: 2, price: 2000, date: upcoming(14), photo: "phuket", type: "Beachfront" },
  { id: 2, name: "Fern & Field Retreat", city: "Chiang Mai", area: "Mae Rim", room: "Garden suite", guests: 2, price: 1890, date: upcoming(15), photo: "chiang-mai", type: "Boutique retreat" },
  { id: 3, name: "The Riverside Quarter", city: "Bangkok", area: "Riverside", room: "Deluxe double", guests: 3, price: 2200, date: upcoming(16), photo: "bangkok", type: "City stay" },
  { id: 4, name: "Andaman Garden Villas", city: "Krabi", area: "Ao Nang", room: "Poolside villa", guests: 3, price: 2780, date: upcoming(18), photo: "krabi", type: "Pool villa" },
  { id: 5, name: "Lotus Bay Hideaway", city: "Koh Samui", area: "Bophut", room: "Palm terrace king", guests: 2, price: 3150, date: upcoming(20), photo: "samui", type: "Island stay" },
  { id: 6, name: "The Courtyard Atrium", city: "Bangkok", area: "Ari", room: "Studio queen", guests: 2, price: 1540, date: upcoming(21), photo: "atrium", type: "City stay" },
  { id: 7, name: "Lanna Canopy Lodge", city: "Chiang Mai", area: "Hang Dong", room: "Balcony suite", guests: 2, price: 2380, date: upcoming(24), photo: "chiang-mai", type: "Mountain retreat" },
  { id: 8, name: "Blue Cove Bungalows", city: "Phuket", area: "Rawai", room: "Garden bungalow", guests: 4, price: 2630, date: upcoming(27), photo: "phuket", type: "Family stay" },
  { id: 9, name: "Crescent Shore Resort", city: "Hua Hin", area: "Khao Takiab", room: "Seaview double", guests: 2, price: 2060, date: upcoming(30), photo: "samui", type: "Beachfront" },
];
export const demoResale = { ...sampleHotels[0], price: 3000, previousPrice: 2000 };
export const baht = (amount: number) => "฿" + new Intl.NumberFormat("en-TH").format(amount);
