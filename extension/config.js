const CONFIG = {
  API_BASE_URL: "http://localhost:8000/api/v1",
  APP_URL: "http://localhost:3000/",
  VIETNAMESE_REGEX:
    /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ\u0300-\u036f\u1E00-\u1EFF]/i,
};
CONFIG.API_URL = CONFIG.API_BASE_URL + "/translate";
CONFIG.AUTH_ME_URL = CONFIG.API_BASE_URL + "/auth/me";
