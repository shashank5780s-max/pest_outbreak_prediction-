export interface DistrictPoint {
  name: string;
  lat: number;
  lng: number;
  aliases: string[];
}

// Approximate centroid coordinates for Karnataka districts (representative)
export const DISTRICTS: DistrictPoint[] = [
  { name: "Bagalkot", lat: 16.1779, lng: 75.7009, aliases: ["Bagalkote"] },
  { name: "Ballari", lat: 15.1394, lng: 76.9214, aliases: ["Bellary"] },
  { name: "Belagavi", lat: 15.8497, lng: 74.4977, aliases: ["Belgaum"] },
  { name: "Bengaluru Rural", lat: 13.1989, lng: 77.706, aliases: ["Bangalore Rural"] },
  { name: "Bengaluru Urban", lat: 12.9716, lng: 77.5946, aliases: ["Bangalore", "Bengaluru"] },
  { name: "Bidar", lat: 17.9133, lng: 77.529, aliases: [] },
  { name: "Chamarajanagara", lat: 11.9139, lng: 76.9395, aliases: ["Chamarajanagar"] },
  { name: "Chikkaballapura", lat: 13.4354, lng: 77.727, aliases: ["Chikballapur"] },
  { name: "Chikkamagaluru", lat: 13.3189, lng: 75.776, aliases: ["Chikmangaluru", "Chikmagalur"] },
  { name: "Chitradurga", lat: 14.2306, lng: 76.4026, aliases: [] },
  { name: "Dakshina Kannada", lat: 12.9141, lng: 74.856, aliases: ["Mangalore", "Mangaluru"] },
  { name: "Davanagere", lat: 14.4644, lng: 75.9218, aliases: ["Davangere"] },
  { name: "Dharwad", lat: 15.4589, lng: 75.0078, aliases: ["Hubballi", "Hubli", "Hubballi-Dharwad"] },
  { name: "Gadag", lat: 15.4336, lng: 75.6355, aliases: [] },
  { name: "Hassan", lat: 13.0072, lng: 76.1026, aliases: [] },
  { name: "Haveri", lat: 14.797, lng: 75.4081, aliases: [] },
  { name: "Kalaburagi", lat: 17.3297, lng: 76.8343, aliases: ["Gulbarga"] },
  { name: "Kodagu", lat: 12.3375, lng: 75.8069, aliases: ["Madikeri"] },
  { name: "Kolar", lat: 13.1366, lng: 78.1294, aliases: [] },
  { name: "Koppal", lat: 15.346, lng: 76.1545, aliases: [] },
  { name: "Mandya", lat: 12.5211, lng: 76.8945, aliases: [] },
  { name: "Mysuru", lat: 12.2958, lng: 76.6394, aliases: ["Mysore"] },
  { name: "Raichur", lat: 16.2043, lng: 77.3609, aliases: [] },
  { name: "Ramanagara", lat: 12.7354, lng: 77.283, aliases: [] },
  { name: "Shivamogga", lat: 14.4674, lng: 75.233, aliases: ["Shimoga"] },
  { name: "Tumakuru", lat: 13.3392, lng: 77.1135, aliases: ["Tumkur"] },
  { name: "Udupi", lat: 13.3409, lng: 74.7421, aliases: [] },
  { name: "Uttara Kannada", lat: 14.615, lng: 74.123, aliases: [] },
  { name: "Vijayapura", lat: 16.8302, lng: 75.71, aliases: ["Bijapur"] },
  { name: "Vijayanagara", lat: 15.1374, lng: 76.331, aliases: ["Hosapete", "Hospet"] },
  { name: "Yadgir", lat: 16.7688, lng: 77.1341, aliases: [] },
];

const normalizeDistrictName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const DISTRICT_LOOKUP = new Map<string, string>();

DISTRICTS.forEach(district => {
  [district.name, ...district.aliases].forEach(alias => {
    DISTRICT_LOOKUP.set(normalizeDistrictName(alias), district.name);
  });
});

export const resolveDistrictName = (value: string) => {
  const normalized = normalizeDistrictName(value);
  if (!normalized) return null;
  return DISTRICT_LOOKUP.get(normalized) ?? null;
};

export default DISTRICTS;
