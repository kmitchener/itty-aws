# Contributing to itty-aws

## Updating AWS API Models

This project uses AWS API models from the official [`aws/api-models-aws`](https://github.com/aws/api-models-aws) repository via a git submodule.

### Initial Setup

When cloning this repository, you need to initialize and update the submodule:

```bash
git submodule update --init
```

### Updating to Latest AWS Models

To update the AWS models to the latest version:

```bash
# Navigate to the aws-models submodule
cd aws-models

# Pull the latest changes
git pull origin main

# Navigate back to the root
cd ..

# Stage the submodule update
git add aws-models

# Commit the update
git commit -m "Update AWS models to latest version"
```

### Alternative: One-line Update

```bash
git submodule update --remote aws-models
git add aws-models
git commit -m "Update AWS models to latest version"
```

### After Updating Models

After updating the AWS models, you should regenerate the TypeScript service clients:

```bash
bun run generate
```

This will:
1. Read the updated models from `aws-models/models/`
2. Generate new TypeScript service definitions in `src/services/`
3. Format the code with Biome
4. Type-check with TypeScript

### Development Workflow

1. Update AWS models (if needed): `git submodule update --remote aws-models`
2. Generate clients: `bun run generate`
3. Run tests: `bun run test`
4. Build: `bun run build`

## Note on AWS Models

The AWS models are sourced from the official AWS repository and are generated from AWS service specifications. The models are updated periodically by AWS to reflect new services, operations, and changes to existing APIs.
