# GitHub Actions Auto-Deploy Setup Guide

## Required GitHub Secrets

You need to add these secrets to your GitHub repository:

### 1. Go to your GitHub repository
- Click on **Settings** tab
- Click on **Secrets and variables** → **Actions**
- Click **New repository secret**

### 2. Add the following secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `SERVER_HOST` | Your server's IP address or domain | `192.168.1.100` or `yourdomain.com` |
| `SERVER_USERNAME` | SSH username for your server | `ubuntu` or `root` |
| `SERVER_PASSWORD` | SSH password for your server | `your_password_here` |
| `SERVER_PORT` | SSH port (usually 22) | `22` |
| `PROJECT_PATH` | Full path to your project directory on server | `/home/ubuntu/mongoweb` or `/var/www/mongoweb` |
| `SONAR_TOKEN` | SonarQube authentication token | `sqp_45abd3663a704c001417e8f1f09d8915181eb8d7` |
| `SONAR_HOST_URL` | SonarQube server URL | `http://45.159.221.243:1800` |

### 3. Alternative: Using SSH Key (More Secure)

If you prefer using SSH keys instead of password:

1. Generate SSH key pair on your local machine:
   ```bash
   ssh-keygen -t rsa -b 4096 -C "github-actions@yourdomain.com"
   ```

2. Copy public key to your server:
   ```bash
   ssh-copy-id username@your-server-ip
   ```

3. Add these secrets instead:
   - `SERVER_HOST`: Your server IP/domain
   - `SERVER_USERNAME`: SSH username
   - `SERVER_KEY`: Your private SSH key content
   - `SERVER_PORT`: SSH port (usually 22)
   - `PROJECT_PATH`: Project directory path

### 4. Update workflow for SSH key (if using keys)

Replace the workflow content with:
```yaml
name: Deploy to Dev Server

on:
  push:
    branches: [ dev ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to server
      uses: appleboy/ssh-action@v1.0.3
      with:
        host: ${{ secrets.SERVER_HOST }}
        username: ${{ secrets.SERVER_USERNAME }}
        key: ${{ secrets.SERVER_KEY }}
        port: ${{ secrets.SERVER_PORT }}
        script: |
          cd ${{ secrets.PROJECT_PATH }}
          git pull origin dev
          
          if git diff HEAD~1 HEAD --name-only | grep -q "package.json\|package-lock.json\|pnpm-lock.yaml"; then
            echo "Dependencies changed, installing..."
            pnpm install
          fi
          
          echo "Deployment completed successfully!"
```

## Testing the Workflow

1. **Push to dev branch**: Make any change and push to the `dev` branch
2. **Check Actions tab**: Go to your GitHub repo → Actions tab to see the workflow running
3. **Manual trigger**: You can also manually trigger it from Actions tab → "Deploy to Dev Server" → "Run workflow"

## Troubleshooting

- **Permission denied**: Make sure your server user has access to the project directory
- **Git pull fails**: Ensure the server has the correct git remote configured
- **SSH connection fails**: Check if your server allows password authentication or if SSH keys are properly configured

## SonarQube Code Quality Analysis

### Setup
SonarQube analysis is automatically configured and will run on:
- Push to `dev`, `main`, or `master` branches
- Pull requests to these branches
- Manual trigger via GitHub Actions

### Required Secrets for SonarQube
- `SONAR_TOKEN`: Your SonarQube authentication token
- `SONAR_HOST_URL`: Your SonarQube server URL

### SonarQube Configuration
The project includes:
- `sonar-project.properties`: Main configuration file
- `.github/workflows/sonarqube.yml`: GitHub Action workflow
- Automatic code quality checks and coverage analysis

### Viewing Results
1. Go to your SonarQube server: `http://45.159.221.243:1800`
2. Login with your credentials
3. Find your project with key `db`
4. View code quality metrics, bugs, vulnerabilities, and code smells

## Security Notes

- Using SSH keys is more secure than passwords
- Make sure your server has proper firewall rules
- Consider using a dedicated deployment user with limited permissions
- Keep your SonarQube token secure and don't expose it in logs
