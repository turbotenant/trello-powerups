# How to Deploy

This guide explains how to deploy the Trello Power-Ups using GitHub Pages.

## Prerequisites

- Git installed on your machine
- GitHub account with repository access
- Repository admin permissions (for GitHub Pages settings)
- Changes committed to your local branch

## Deployment Steps

### 1. Ensure Your Changes Are Committed

Before deploying, make sure all your changes are committed:

```bash
# Check current status
git status

# Add any untracked files
git add .

# Commit your changes
git commit -m "Update Power-Up: [describe your changes]"
```

### 2. Push to Main Branch

GitHub Pages typically deploys from the `main` branch:

```bash
# Push your changes to the main branch
git push origin main
```

**Note:** If you're working on a feature branch, create a pull request and merge it to `main` first.

### 3. Enable GitHub Pages (First Time Only)

If GitHub Pages is not already enabled for the repository:

1. Go to your repository on GitHub
2. Click **Settings** (top right)
3. Scroll down to **Pages** section in the left sidebar
4. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **Save**

GitHub will display the URL where your site is published:

```
https://turbotenant.github.io/trello-powerups/
```

### 4. Wait for Deployment

GitHub Pages typically takes 1-5 minutes to build and deploy:

1. Go to the **Actions** tab in your repository
2. You should see a workflow running (pages-build-deployment)
3. Wait for the green checkmark indicating successful deployment

### 5. Verify Deployment

Test that your Power-Ups are accessible:

```bash
# Time in List Power-Up
https://turbotenant.github.io/trello-powerups/time-in-list/index.html

# Start Case Power-Up
https://turbotenant.github.io/trello-powerups/start-case/index.html
```

Open these URLs in your browser to verify they load correctly.


## Updating Trello Power-Up URLs

### For New Power-Ups

1. Go to [Trello Power-Ups Admin](https://trello.com/power-ups/admin)
2. Click "Create new Power-Up"
3. Fill in the details:
   - **Name**: Your Power-Up name
   - **Iframe connector URL**: `https://turbotenant.github.io/trello-powerups/time-in-list/` Do not point to the index html
4. Configure capabilities and save
   - It is mandatory to have at least the onEnabled one

### For Existing Power-Ups

1. Go to [Trello Power-Ups Admin](https://trello.com/power-ups/admin)
2. Select your Power-Up
3. Update the **Iframe connector URL** if needed
4. Save changes

# Create API Key

1. Go to [Trello Power-Ups Admin](https://trello.com/power-ups/admin)
2. Select your Power-Up
3. Go to API Key on the left, and generate one
4. You can set the allowed origins as https://turbotenant.github.io
5. You need to copy this key and put in your power up project. It is needed to handle authorization and do API requests