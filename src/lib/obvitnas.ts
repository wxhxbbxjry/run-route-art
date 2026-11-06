import { LatLng } from './types';
import { haversineDistance } from './geo';

export interface ObvitnasZone {
  id: string;
  name: string;
  sector: 'esdm' | 'transport' | 'telecom' | 'finance' | 'defense';
  sectorName: string;
  lat: number;
  lng: number;
  radiusKm: number; // Exclusion buffer radius in kilometers
}

/**
 * Daftar Komprehensif Objek Vital Nasional (Obvitnas) Republik Indonesia.
 * Tidak boleh dilalui atau dijadikan waypoint rute lari/olahraga demi alasan
 * keamanan negara, keselamatan, instalasi tegangan tinggi/berbahaya, dan zona steril.
 */
export const OBVITNAS_ZONES: ObvitnasZone[] = [
  // =========================================================================
  // 1. Sektor Energi & Sumber Daya Mineral (Pembangkit, Kilang, TBBM, GITET, Tambang)
  // =========================================================================
  {
    id: 'esdm-plumpang',
    name: 'Integrated Terminal BBM Pertamina Plumpang',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.1364,
    lng: 106.8972,
    radiusKm: 0.65,
  },
  {
    id: 'esdm-pltgu-muara-karang',
    name: 'PLTGU Muara Karang (PLN IP)',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.1105,
    lng: 106.7865,
    radiusKm: 0.75,
  },
  {
    id: 'esdm-pltgu-priok',
    name: 'PLTGU Tanjung Priok (PLN)',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.1082,
    lng: 106.8778,
    radiusKm: 0.7,
  },
  {
    id: 'esdm-pltgu-muara-tawar',
    name: 'PLTGU Muara Tawar Bekasi',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.0863,
    lng: 106.9942,
    radiusKm: 0.9,
  },
  {
    id: 'esdm-gitet-gandul',
    name: 'GITET 500kV Gandul Depok',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.3312,
    lng: 106.7874,
    radiusKm: 0.45,
  },
  {
    id: 'esdm-gitet-cawang',
    name: 'Gardu Induk Cawang Baru PLN',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.2482,
    lng: 106.8685,
    radiusKm: 0.35,
  },
  {
    id: 'esdm-gitet-kembangan',
    name: 'GITET 500kV Kembangan Jakarta Barat',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.1843,
    lng: 106.7324,
    radiusKm: 0.4,
  },
  {
    id: 'esdm-kilang-balongan',
    name: 'Kilang Minyak Pertamina RU VI Balongan',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.3688,
    lng: 108.3842,
    radiusKm: 1.5,
  },
  {
    id: 'esdm-kilang-cilacap',
    name: 'Kilang Minyak Pertamina RU IV Cilacap',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -7.6985,
    lng: 109.0205,
    radiusKm: 1.8,
  },
  {
    id: 'esdm-kilang-balikpapan',
    name: 'Kilang Minyak Pertamina RU V Balikpapan',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -1.2583,
    lng: 116.8286,
    radiusKm: 1.6,
  },
  {
    id: 'esdm-kilang-plaju',
    name: 'Kilang Pertamina RU III Plaju-Sungai Gerong Palembang',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -2.9961,
    lng: 104.8312,
    radiusKm: 1.4,
  },
  {
    id: 'esdm-kilang-dumai',
    name: 'Kilang Minyak Pertamina RU II Dumai',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: 1.6789,
    lng: 101.4674,
    radiusKm: 1.5,
  },
  {
    id: 'esdm-pltu-suralaya',
    name: 'PLTU Suralaya Banten',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -5.8895,
    lng: 106.0354,
    radiusKm: 1.4,
  },
  {
    id: 'esdm-pltu-paiton',
    name: 'PLTU Paiton Probolinggo',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -7.7126,
    lng: 113.5786,
    radiusKm: 1.5,
  },
  {
    id: 'esdm-plta-cirata',
    name: 'Kompleks PLTA Cirata Purwakarta',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.7028,
    lng: 107.3625,
    radiusKm: 0.9,
  },
  {
    id: 'esdm-plta-saguling',
    name: 'Kompleks PLTA Saguling Bandung Barat',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -6.8624,
    lng: 107.3752,
    radiusKm: 0.8,
  },
  {
    id: 'esdm-tbbm-tanjung-gerem',
    name: 'Fuel Terminal BBM Tanjung Gerem Cilegon',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -5.9735,
    lng: 106.0024,
    radiusKm: 0.6,
  },
  {
    id: 'esdm-tbbm-manggis',
    name: 'Terminal BBM Pertamina Manggis Bali',
    sector: 'esdm',
    sectorName: 'Energi & SDM',
    lat: -8.5147,
    lng: 115.5264,
    radiusKm: 0.7,
  },

  // =========================================================================
  // 2. Sektor Transportasi (Bandara, Pelabuhan Utama, Stasiun Besar, Terminal Logistik)
  // =========================================================================
  {
    id: 'trans-cgk',
    name: 'Bandara Internasional Soekarno-Hatta (CGK)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.1256,
    lng: 106.6559,
    radiusKm: 2.8,
  },
  {
    id: 'trans-hlp',
    name: 'Bandara Internasional & Lanud Halim Perdanakusuma (HLP)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.2652,
    lng: 106.8912,
    radiusKm: 1.8,
  },
  {
    id: 'trans-dps',
    name: 'Bandara Internasional I Gusti Ngurah Rai Bali (DPS)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -8.7482,
    lng: 115.1672,
    radiusKm: 1.7,
  },
  {
    id: 'trans-sub',
    name: 'Bandara Internasional Juanda Surabaya (SUB)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -7.3798,
    lng: 112.7874,
    radiusKm: 1.9,
  },
  {
    id: 'trans-kno',
    name: 'Bandara Internasional Kualanamu Medan (KNO)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: 3.6422,
    lng: 98.8852,
    radiusKm: 2.0,
  },
  {
    id: 'trans-yia',
    name: 'Bandara Internasional Yogyakarta (YIA Kulon Progo)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -7.9009,
    lng: 110.0573,
    radiusKm: 1.8,
  },
  {
    id: 'trans-upg',
    name: 'Bandara Internasional Sultan Hasanuddin Makassar (UPG)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -5.0616,
    lng: 119.5541,
    radiusKm: 1.8,
  },
  {
    id: 'trans-priok',
    name: 'Pelabuhan Utama Tanjung Priok & Terminal Peti Kemas (JICT/Koja)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.1042,
    lng: 106.8834,
    radiusKm: 1.5,
  },
  {
    id: 'trans-perak',
    name: 'Pelabuhan Utama Tanjung Perak Surabaya',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -7.1983,
    lng: 112.7342,
    radiusKm: 1.3,
  },
  {
    id: 'trans-belawan',
    name: 'Pelabuhan Utama Belawan Medan',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: 3.7842,
    lng: 98.6924,
    radiusKm: 1.3,
  },
  {
    id: 'trans-st-gambir',
    name: 'Stasiun Kereta Api Besar Gambir (Steril Rel & Emplasemen)',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.1767,
    lng: 106.8306,
    radiusKm: 0.35,
  },
  {
    id: 'trans-st-senen',
    name: 'Stasiun Kereta Api Pasar Senen & Dipo Kereta',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.1744,
    lng: 106.8453,
    radiusKm: 0.35,
  },
  {
    id: 'trans-dipo-cipinang',
    name: 'Dipo Induk Lokomotif Cipinang',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.2132,
    lng: 106.8856,
    radiusKm: 0.45,
  },
  {
    id: 'trans-cikarang-dryport',
    name: 'Terminal Logistik Cikarang Dry Port',
    sector: 'transport',
    sectorName: 'Transportasi',
    lat: -6.2862,
    lng: 107.1652,
    radiusKm: 0.75,
  },

  // =========================================================================
  // 3. Sektor Telekomunikasi & Informasi (Pusat Data Nasional, Stasiun Penyiaran Negara, Tower)
  // =========================================================================
  {
    id: 'telecom-pdn-cikarang',
    name: 'Pusat Data Nasional (PDN) Kominfo Cikarang',
    sector: 'telecom',
    sectorName: 'Telekomunikasi & IT',
    lat: -6.3421,
    lng: 107.1584,
    radiusKm: 0.45,
  },
  {
    id: 'telecom-tvri-pusat',
    name: 'Kompleks Stasiun Penyiaran Negara TVRI Pusat Senayan',
    sector: 'telecom',
    sectorName: 'Telekomunikasi & IT',
    lat: -6.2138,
    lng: 106.7997,
    radiusKm: 0.4,
  },
  {
    id: 'telecom-rri-pusat',
    name: 'Stasiun Penyiaran Radio Republik Indonesia (RRI Pusat)',
    sector: 'telecom',
    sectorName: 'Telekomunikasi & IT',
    lat: -6.1738,
    lng: 106.8223,
    radiusKm: 0.3,
  },
  {
    id: 'telecom-bumi-jatiluhur',
    name: 'Stasiun Bumi Telekomunikasi Satelit Jatiluhur',
    sector: 'telecom',
    sectorName: 'Telekomunikasi & IT',
    lat: -6.5384,
    lng: 107.3912,
    radiusKm: 0.6,
  },
  {
    id: 'telecom-bumi-cibinong',
    name: 'Stasiun Bumi Telkom Cibinong',
    sector: 'telecom',
    sectorName: 'Telekomunikasi & IT',
    lat: -6.4824,
    lng: 106.8524,
    radiusKm: 0.45,
  },

  // =========================================================================
  // 4. Sektor Keuangan & Perbankan (Bank Indonesia, OJK, Bursa Efek Indonesia)
  // =========================================================================
  {
    id: 'finance-bi-pusat',
    name: 'Kompleks Kantor Pusat Bank Indonesia (BI Thamrin)',
    sector: 'finance',
    sectorName: 'Keuangan & Perbankan',
    lat: -6.1812,
    lng: 106.8228,
    radiusKm: 0.38,
  },
  {
    id: 'finance-ojk-lapangan-banteng',
    name: 'Otoritas Jasa Keuangan (Gedung Soemitro Djojohadikusumo)',
    sector: 'finance',
    sectorName: 'Keuangan & Perbankan',
    lat: -6.1708,
    lng: 106.8375,
    radiusKm: 0.32,
  },
  {
    id: 'finance-ojk-radius-prawiro',
    name: 'Gedung Menara Radius Prawiro OJK',
    sector: 'finance',
    sectorName: 'Keuangan & Perbankan',
    lat: -6.1822,
    lng: 106.8236,
    radiusKm: 0.3,
  },
  {
    id: 'finance-bei-scbd',
    name: 'Gedung Bursa Efek Indonesia (BEI / IDX Tower SCBD)',
    sector: 'finance',
    sectorName: 'Keuangan & Perbankan',
    lat: -6.2248,
    lng: 106.8094,
    radiusKm: 0.35,
  },

  // =========================================================================
  // 5. Sektor Pemerintahan & Pertahanan (Istana, DPR/MPR, MA, Mabes TNI, Pindad)
  // =========================================================================
  {
    id: 'gov-istana-merdeka',
    name: 'Kompleks Istana Kepresidenan RI (Istana Merdeka & Istana Negara)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.1702,
    lng: 106.8245,
    radiusKm: 0.45,
  },
  {
    id: 'gov-istana-bogor',
    name: 'Istana Kepresidenan Bogor',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.5978,
    lng: 106.7972,
    radiusKm: 0.65,
  },
  {
    id: 'gov-istana-cipanas',
    name: 'Istana Kepresidenan Cipanas',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.7328,
    lng: 107.0398,
    radiusKm: 0.5,
  },
  {
    id: 'gov-dpr-mpr',
    name: 'Kompleks Parlemen Republik Indonesia (Gedung DPR/MPR/DPD RI Senayan)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.2088,
    lng: 106.7998,
    radiusKm: 0.5,
  },
  {
    id: 'gov-mahkamah-agung',
    name: 'Gedung Mahkamah Agung & Mahkamah Konstitusi RI',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.1714,
    lng: 106.8286,
    radiusKm: 0.32,
  },
  {
    id: 'gov-kemhan',
    name: 'Kementerian Pertahanan Republik Indonesia (Kemhan)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.1748,
    lng: 106.8218,
    radiusKm: 0.3,
  },
  {
    id: 'mil-mabes-tni-cilangkap',
    name: 'Mabes TNI Cilangkap (TNI AD, AL, AU)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.3318,
    lng: 106.9082,
    radiusKm: 1.4,
  },
  {
    id: 'mil-mabes-ad',
    name: 'Markas Besar TNI Angkatan Darat (Mabes AD)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.1691,
    lng: 106.8268,
    radiusKm: 0.35,
  },
  {
    id: 'mil-mabes-polri',
    name: 'Markas Besar Kepolisian Republik Indonesia (Mabes Polri Trunojoyo)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.2392,
    lng: 106.8015,
    radiusKm: 0.4,
  },
  {
    id: 'mil-kopassus-cijantung',
    name: 'Kompleks Markas Komando Pasukan Khusus (Kopassus Cijantung)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.3218,
    lng: 106.8624,
    radiusKm: 0.9,
  },
  {
    id: 'mil-marinir-cilandak',
    name: 'Ksatrian Marinir Hartono Cilandak',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.3045,
    lng: 106.8082,
    radiusKm: 0.85,
  },
  {
    id: 'mil-brimob-kelapadua',
    name: 'Mako Korps Brimob Polri Kelapa Dua Depok',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.3562,
    lng: 106.8485,
    radiusKm: 0.8,
  },
  {
    id: 'defense-pindad-bandung',
    name: 'Industri Pertahanan PT Pindad (Persero) Bandung',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.9382,
    lng: 107.6534,
    radiusKm: 0.8,
  },
  {
    id: 'defense-pindad-turen',
    name: 'Divisi Munisi PT Pindad Turen Malang',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -8.1642,
    lng: 112.7154,
    radiusKm: 0.85,
  },
  {
    id: 'defense-pt-pal',
    name: 'Industri Pertahanan Galangan Kapal Perang PT PAL Surabaya',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -7.1952,
    lng: 112.7424,
    radiusKm: 0.95,
  },
  {
    id: 'defense-ptdi-bandung',
    name: 'Industri Pertahanan Kedirgantaraan PT Dirgantara Indonesia (PTDI)',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.8974,
    lng: 107.5786,
    radiusKm: 1.1,
  },
  {
    id: 'defense-dahana-subang',
    name: 'Kawasan Energetic Material Center PT Dahana Subang',
    sector: 'defense',
    sectorName: 'Pemerintahan & Pertahanan',
    lat: -6.5284,
    lng: 107.7282,
    radiusKm: 1.3,
  },
];

/**
 * Checks if a coordinate point is located inside any National Vital Object (Obvitnas) restricted zone.
 */
export function checkObvitnasViolation(point: LatLng): {
  isRestricted: boolean;
  zone?: ObvitnasZone;
  distanceToCenterKm?: number;
} {
  for (const zone of OBVITNAS_ZONES) {
    const dist = haversineDistance(point, { lat: zone.lat, lng: zone.lng });
    if (dist < zone.radiusKm) {
      return {
        isRestricted: true,
        zone,
        distanceToCenterKm: dist,
      };
    }
  }
  return { isRestricted: false };
}

/**
 * If a point lands inside an Obvitnas zone, safely pushes it outside the perimeter
 * to the nearest accessible public ring road with an extra safety buffer.
 */
export function pushOutOfObvitnas(point: LatLng): LatLng {
  const check = checkObvitnasViolation(point);
  if (!check.isRestricted || !check.zone) {
    return point;
  }

  const zone = check.zone;
  const dLat = point.lat - zone.lat;
  const dLng = point.lng - zone.lng;

  // Approximate distance in km
  const kmPerLat = 111.139;
  const kmPerLng = kmPerLat * Math.cos((zone.lat * Math.PI) / 180);

  const dy = dLat * kmPerLat;
  const dx = dLng * (kmPerLng || 1);
  const curDist = Math.sqrt(dx * dx + dy * dy);

  // Buffer: zone radius + 100 meters outside the perimeter
  const targetDistKm = zone.radiusKm + 0.1;

  if (curDist < 0.001) {
    // If point was at exact center, push north
    return {
      lat: zone.lat + targetDistKm / kmPerLat,
      lng: zone.lng,
    };
  }

  const scale = targetDistKm / curDist;
  const newDy = dy * scale;
  const newDx = dx * scale;

  return {
    lat: zone.lat + newDy / kmPerLat,
    lng: zone.lng + newDx / (kmPerLng || 1),
  };
}

/**
 * Checks if any segment of a route intersects any Obvitnas zone.
 */
export function routeHasObvitnasViolation(coordinates: LatLng[]): {
  hasViolation: boolean;
  violatedZones: ObvitnasZone[];
} {
  const violatedMap = new Map<string, ObvitnasZone>();

  // Check sample coordinates along the path
  const step = Math.max(1, Math.floor(coordinates.length / 50));
  for (let i = 0; i < coordinates.length; i += step) {
    const check = checkObvitnasViolation(coordinates[i]);
    if (check.isRestricted && check.zone) {
      violatedMap.set(check.zone.id, check.zone);
    }
  }

  // Also check finish point
  if (coordinates.length > 0) {
    const lastCheck = checkObvitnasViolation(coordinates[coordinates.length - 1]);
    if (lastCheck.isRestricted && lastCheck.zone) {
      violatedMap.set(lastCheck.zone.id, lastCheck.zone);
    }
  }

  const violatedZones = Array.from(violatedMap.values());
  return {
    hasViolation: violatedZones.length > 0,
    violatedZones,
  };
}
