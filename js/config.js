/* 前端运行配置
   部署云端后端后，把 SYNC_API_URL 改为你的后端地址即可启用：
   - 账号注册/登录 + 多设备数据同步
   - 政治理论「🤖 大模型智能出题」（后端需配置 LLM_API_KEY 等环境变量）
   例如： window.APP_CONFIG = { SYNC_API_URL: "https://kaogong-sync.onrender.com" };

   大模型密钥（LLM_API_KEY / LLM_API_URL / LLM_MODEL）只配置在后端环境变量，
   不要写在前端，避免泄露。 */
window.APP_CONFIG = {
  SYNC_API_URL: ""
};
