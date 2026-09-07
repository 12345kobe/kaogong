/* 前端运行配置
   云端同步默认基于 GitHub（无需自建后端）：
   - 账号 = 自定义用户名 + GitHub 个人访问令牌(PAT，需 repo 或 public_repo 权限)
   - 用户数据存于仓库的 userdata 分支（data/<用户名>.json），与部署的 main 分支隔离，部署不会清空
   - 换设备 / 换链接都不丢、自动累积；登录一次后令牌存本机浏览器，一直保持登录

   如需改用自建后端（含大模型智能出题），把 SYNC_API_URL 改成你的后端地址，
   并参考旧版后端协议实现 /api/register、/api/login、/api/data 接口即可。 */
window.APP_CONFIG = {
  SYNC_API_URL: "",
  GH: { owner: "12345kobe", repo: "kaogong", dataBranch: "userdata" }
};
