// Configuração do PM2 para produção (VPS).
// Usar .cjs porque o package.json tem "type": "module".
// Referência: https://pm2.keymetrics.io/docs/usage/application-declaration/
module.exports = {
  apps: [
    {
      name: 'agente-bling-cafe',
      script: 'src/bootstrap.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
