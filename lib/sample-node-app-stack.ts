import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import { Vpc } from "./construct/vpc";
import { SecurityGroup } from "./construct/securityGroup";
import { Alb } from "./construct/alb";
import { Rds } from "./construct/rds";
import { Ecs } from "./construct/ecs";
import { SecretsManager } from "./construct/secretsManager";

export class SampleNodeAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps, readonly resourceName = "sample-node-app") {
    super(scope, id, props);

    /**
     *
     * ECR
     *
     */
    const repository = ecr.Repository.fromRepositoryName(
      this,
      "EcrRepository",
      resourceName,
    );

    /**
     *
     * VPC
     *
     */
    const vpc = new Vpc(this, "Vpc", resourceName);

    /**
     *
     * Security Group
     *
     */
    const securityGroup = new SecurityGroup(this, "SecurityGroup", {
      vpc,
      resourceName,
    });

    /**
     *
     * Application Load Balancer
     *
     */
    const alb = new Alb(this, "Alb", {
      vpc,
      resourceName,
      securityGroup: securityGroup.albSecurityGroup,
    });

    // NOTE: 出力としてロードバランサーのDNS名を出力
    new CfnOutput(this, "LoadBalancerDns", {
      value: alb.value.loadBalancerDnsName,
    });

    /**
     *
     * RDS
     *
     */
    new Rds(this, "Rds", {
      vpc,
      securityGroup: securityGroup.rdsSecurityGroup,
    });

    /**
     *
     * Secrets Manager
     *
     */
    const secretsManager = new SecretsManager(this, "SecretsManager");
    const keys: ["username", "password", "host", "port", "dbname"] = ["username", "password", "host", "port", "dbname"] as const;
    const { username, password, host, port, dbname } = secretsManager.getSecretValue(keys);
    const databaseUrl = `postgresql://${username}:${password}@${host}:${port}/${dbname}`;

    /**
     *
     * ECS on Fargate
     *
     */
    const ecs = new Ecs(this, "EcsFargate", {
      vpc,
      resourceName,
      ecrRepository: repository,
      securityGroup: securityGroup.ecsSecurityGroup,
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
  }
}
