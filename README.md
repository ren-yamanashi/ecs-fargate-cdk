# Sample app to build ECS on Fargate with AWS CDK

## setting env
```sh
cp default.env .env
```

## install modules
```sh
pnpm install --frozen-lock-file
```

## application commands
build
```sh
pnpm run build
```

## cdk commands

deploy this stack to your default AWS account/region
```sh
cdk deploy
```

compare deployed stack with current state
```sh
cdk diff
```

emits the synthesized CloudFormation template
```sh
cdk synth
```
