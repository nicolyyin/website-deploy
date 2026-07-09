(() => {
  "use strict";

  const UNKNOWN_DISTRICT = "未標示區域";
  const DISTRICT_NOISE = [
    "重劃區",
    "生活區",
    "學區",
    "園區",
    "工業區",
    "商業區",
    "住宅區",
    "風景區",
    "特區",
    "市區",
    "郊區",
    "區域",
  ];

  const CITY_COUNTY_PATTERN =
    /(?:臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|臺東縣|台東縣|澎湖縣|金門縣|連江縣)\s*([^\s，,。；;、｜|/]{1,6}(?:區|鄉|鎮|市))/;

  const CENTRAL_DISTRICTS = [
    "和平區",
    "新社區",
    "石岡區",
    "外埔區",
    "大安區",
    "神岡區",
    "后里區",
    "潭子區",
    "大雅區",
    "烏日區",
    "霧峰區",
    "大肚區",
    "龍井區",
    "沙鹿區",
    "梧棲區",
    "清水區",
    "大甲區",
    "太平區",
    "大里區",
    "豐原區",
    "東勢區",
    "西屯區",
    "南屯區",
    "北屯區",
    "中區",
    "東區",
    "南區",
    "西區",
    "北區",
    "彰化市",
    "員林市",
    "和美鎮",
    "鹿港鎮",
    "溪湖鎮",
    "田中鎮",
    "北斗鎮",
    "二林鎮",
    "線西鄉",
    "伸港鄉",
    "福興鄉",
    "秀水鄉",
    "花壇鄉",
    "芬園鄉",
    "大村鄉",
    "埔鹽鄉",
    "埔心鄉",
    "永靖鄉",
    "社頭鄉",
    "二水鄉",
    "田尾鄉",
    "埤頭鄉",
    "芳苑鄉",
    "大城鄉",
    "竹塘鄉",
    "溪州鄉",
    "南投市",
    "埔里鎮",
    "草屯鎮",
    "竹山鎮",
    "集集鎮",
    "名間鄉",
    "鹿谷鄉",
    "中寮鄉",
    "魚池鄉",
    "國姓鄉",
    "水里鄉",
    "信義鄉",
    "仁愛鄉",
    "斗六市",
    "斗南鎮",
    "虎尾鎮",
    "西螺鎮",
    "土庫鎮",
    "北港鎮",
    "古坑鄉",
    "大埤鄉",
    "莿桐鄉",
    "林內鄉",
    "二崙鄉",
    "崙背鄉",
    "麥寮鄉",
    "東勢鄉",
    "褒忠鄉",
    "台西鄉",
    "元長鄉",
    "四湖鄉",
    "口湖鄉",
    "水林鄉",
  ].sort((a, b) => b.length - a.length);

  const originalDistrictForListing = districtForListing;
  const originalBuildPayload = buildPayload;

  districtForListing = function districtForListingWithFallback(listing) {
    const details = listing?.details || {};
    const candidates = [
      details.district,
      details.address,
      listing?.title,
      details.community,
      details.description,
      listing?.note,
    ];

    for (const value of candidates) {
      const district = detectDistrict(value);
      if (district) return district;
    }

    const original = originalDistrictForListing(listing);
    const normalizedOriginal = detectDistrict(original);
    return normalizedOriginal || UNKNOWN_DISTRICT;
  };

  buildPayload = function buildPayloadWithDistricts() {
    const payload = originalBuildPayload();

    return {
      ...payload,
      listings: (payload.listings || []).map((listing) => {
        const district = districtForListing(listing);
        if (!district || district === UNKNOWN_DISTRICT) return listing;

        return {
          ...listing,
          details: {
            ...(listing.details || {}),
            district,
          },
        };
      }),
    };
  };

  function detectDistrict(value) {
    const text = String(value || "")
      .replace(/臺/g, "台")
      .replace(/\s+/g, " ")
      .trim();

    if (!text || text === UNKNOWN_DISTRICT) return "";

    const explicitMatch = text.match(CITY_COUNTY_PATTERN);
    if (explicitMatch) {
      const district = normalizeDistrict(explicitMatch[1]);
      if (isUsableDistrict(district)) return district;
    }

    for (const district of CENTRAL_DISTRICTS) {
      if (text.includes(district)) return district;
    }

    for (const district of CENTRAL_DISTRICTS) {
      const shortName = district.replace(/[區鄉鎮市]$/, "");
      if (shortName.length >= 2 && text.includes(shortName)) return district;
    }

    const genericMatches = text.match(/[\u4e00-\u9fff]{1,6}(?:區|鄉|鎮|市)/g) || [];
    for (const match of genericMatches) {
      const district = normalizeDistrict(match);
      if (isUsableDistrict(district)) return district;
    }

    return "";
  }

  function normalizeDistrict(value) {
    return String(value || "")
      .replace(/臺/g, "台")
      .replace(/^(?:台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)/, "")
      .trim();
  }

  function isUsableDistrict(value) {
    if (!value || value.length > 7) return false;
    if (!/[區鄉鎮市]$/.test(value)) return false;
    return !DISTRICT_NOISE.some((noise) => value.includes(noise));
  }
})();
