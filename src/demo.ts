import { dateKey } from "./chain";

export const today = () => dateKey(BigInt(Math.floor(Date.now() / 1000)));
function upcoming(days: number) {
  return dateKey(BigInt(Math.floor(Date.now() / 1000)) + BigInt(days * 86400));
}

export const sampleHotels = [
  { id: 1, name: "The Tide House", city: "Phuket", area: "Kata Beach", room: "Ocean-view king", guests: 2, price: 2000, date: upcoming(14), photo: "phuket", type: "Beachfront" },
  { id: 2, name: "Fern & Field Retreat", city: "Chiang Mai", area: "Mae Rim", room: "Garden suite", guests: 2, price: 1890, date: upcoming(15), photo: "chiang-mai", type: "Boutique retreat" },
  { id: 3, name: "The Riverside Quarter", city: "Bangkok", area: "Riverside", room: "Deluxe double", guests: 3, price: 2200, date: upcoming(16), photo: "bangkok", type: "City stay" },
];
export const demoResale = { ...sampleHotels[0], price: 3000, previousPrice: 2000 };
export const baht = (amount: number) => "฿" + new Intl.NumberFormat("en-TH").format(amount);
