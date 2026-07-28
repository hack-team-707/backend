module.exports = {
  apps: [
    {
      name: 'resolve-api',
      script: 'dist/main.js',
      cwd: '/home/ec2-user/resolve-backend/current',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
