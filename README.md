# Sample app to build ECS on Fargate with AWS CDK

## install modules
```sh
npm ci
```

## application commands
build
```sh
npm run build:app
```

## cdk commands
compile typescript to js
```sh
npm run build
```

watch for changes and compile
```sh
npm run watch
```

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
