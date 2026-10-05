// Suggestions help input only; report strings and existing categories stay unchanged.
export const masterSuggestions = {
 people: [],
 doctors: 'Dr Aiman|Dr Ain|Dr Amira|Dr Diyana|Dr Magesh|Dr Faizal|Dr Syahirah|Dr Lai|Dr Ying|Dr Hakimi|Dr Hakim|Dr Woon|Dr Hafis'.split('|'),
 ppp: 'SOFI|USAIDILLAH|AMIRULFAIZ|ROSLIZA|NAZIRUL|ROSLI|FAIRUZ|JAMSHID|AFIQ|MAZNAN|FAQRUL|EMIR|AIREEN|AMIR|MARZUQI|YUSSERI YASSIN|YUSSERI HARON'.split('|'),
 nurses: 'RAJA|SYAFIQAH|NORESAH|KAMARIAH|NISA|FARIHAH|IZATTI'.split('|'),
 ppk: 'SUFIAN|KHAIRI HASSAN|KHAIRI JR|FUZAILAH|NAJIB|SYAKIR|SANIZAM|JAMRUS|AMIN'.split('|'),
 drivers: 'NIK|AZMAN|FITRI|NIZAM|AHMAD|ZUIFADLI|ZAABAR|WAN ROSMAINIE|SAIFUL|AZRUL|HAIRI|ZULKIFLY|BAKRI|HJ YASRAN|NURAFFINDIE|RAZLAN|KHAIRUDDIN|FARDLY|ZAINI|HADI|MUZAFAR|OTHMAN|NAKHAE'.split('|'),
 vehicles: 'VFP 6164|VFP 6162|BPH 2039|BPH 1365|W5896L|BMA 2712|BKP 594|CDB 3645|BRV 5261|CBW|CCG|VQQ|CDX|WXJ – Van Jenazah|WXJ – Minibus'.split('|'),
 units: 'Jabatan Kecemasan|ENT|Psikiatri|Farmasi|Makmal|Pejabat|Scope Room|Eye|Anestesiologi|O&G|MOPD|OPD|SOPD|HDU|Dietetik|Sajian|Rehabilitasi|Forensik|E.O|Pengarah|Timbalan Pengarah|Infection Control|Kualiti|Pejabat Rekod|X-Ray|Wad 3A|Wad 4A|Wad 5A|Wad 5B|Wad 6A|Wad 6B|NICU|ICU|Dewan Bedah|Kejururawatan|Unit Penyeliaan|Unit Pemandu|Stor|Renal Clinic|Unit Kewangan|Unit Hasil|Fisioterapi'.split('|'),
 destinations: 'KKIA|PKD|Klinik Padang Tengku|Klinik Bukit Betong|Klinik Sungai Koyan|Klinik Chegar Perah|Klinik Merapoh|Klinik Benta|Klinik Mela|Hospital Cameron|Hospital Raub|HTAA|HOSHAS|HKL|HTA (Hospital Tunku Azizah)|Hospital Seremban|Hospital Kuala Krai|HRPZ Kelantan|HRPB Ipoh|Melaka|Kota Bharu|Negeri Sembilan|Selangor|Hospital Selayang|Hospital Klang|PDN|KL|Dataran Orang Kaya Haji|Hospital Ampang|Bentong|Kuantan|Temerloh|Chegar Perah|Merapoh|Benta|Sungai Koyan|Hospital Jengka|Raub|Cameron Highland|Genting Highland|Bukit Tinggi|Bera|Kampung Gua|Kechau|Kampung Kuala Kechau|Pejabat Tanah|Mahkamah Lipis|Dewan Residen|IPD Lipis|Balai Bomba Lipis|Tanjung Jambu|Sungai Ular|Penjom|Klinik Desa Penjom'.split('|'),
} satisfies Record<string, string[]>;
export type SuggestionKind = keyof typeof masterSuggestions;
export function staffSuggestionKind(category: string): SuggestionKind {
 switch (category) {
  case 'Pegawai Perubatan': return 'doctors';
  case 'PPP': return 'ppp';
  case 'Nurse/Jururawat': return 'nurses';
  case 'PPK': return 'ppk';
  case 'Pemandu Ambulans': return 'drivers';
  default: return 'people';
 }
}
