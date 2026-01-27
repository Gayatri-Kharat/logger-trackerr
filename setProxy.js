const { createProxyMiddleware } = require('http-proxy-middleware');
 
module.exports = function(app) {
  app.use(
    '/auth',
    createProxyMiddleware({
      target: 'https://keycloak-vfde-il08-env24-runtime.apps.ildelocpvfd408.ocpd.corp.amdocs.com',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug', // Remove after debugging
    })
  );
};