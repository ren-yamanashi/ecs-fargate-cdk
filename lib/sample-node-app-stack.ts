import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { Vpc } from "./construct/vpc";
import { SecurityGroup } from "./construct/securityGroup";
import { Alb } from "./construct/alb";
import { Rds } from "./construct/rds";
import { Ecs } from "./construct/ecs";
import { SecretsManager } from "./construct/secrets-manager";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps, readonly resourceName = "sample-node-app") {
    super(scope, id, props);

    // ECR
    const repository = Repository.fromRepositoryName(
      this,
      "EcrRepository",
      resourceName,
    );

    // VPC
    const vpc = new Vpc(this, "Vpc", resourceName);

    // Security Group
    const { albSecurityGroup, ecsSecurityGroup, rdsSecurityGroup } = new SecurityGroup(this, "SecurityGroup", {
      vpc,
      resourceName,
    });

    // ALB
    const alb = new Alb(this, "Alb", {
      vpc,
      resourceName,
      securityGroup: albSecurityGroup,
    });

    // RDS
    new Rds(this, "Rds", {
      vpc,
      securityGroup: rdsSecurityGroup,
    });

    // Secrets Manager
    const secretsManager = new SecretsManager(this, "SecretsManager");
    const keys: ["username", "password", "host", "port", "dbname"] = ["username", "password", "host", "port", "dbname"] as const;
    const { username, password, host, port, dbname } = secretsManager.getSecretValue(keys);
    const databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${dbname}`;

    // ECS(Fargate)
    const ecs = new Ecs(this, "EcsFargate", {
      vpc,
      resourceName,
      ecrRepository: repository,
      securityGroup: ecsSecurityGroup,
      env: {
        databaseUrl,
      },
    });

    // NOTE: ターゲットグループにタスクを追加
    alb.addTargets("Ecs", {
      port: 80,
      targets: [ecs.fargateService],
      healthCheck: {
        path: "/",
        interval: Duration.minutes(1),
      },
    });

    // NOTE: 出力としてロードバランサーのDNS名を出力
    new CfnOutput(this, "LoadBalancerDns", {
      value: alb.value.loadBalancerDnsName,
    });
  }
}
