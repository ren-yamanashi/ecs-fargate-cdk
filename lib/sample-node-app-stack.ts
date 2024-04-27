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
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const resourceName = "sample-node-app";

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
      albSecurityGroup: securityGroup.albSecurityGroup,
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
    const rds = new Rds(this, "Rds", {
      vpc,
      rdsSecurityGroup: securityGroup.rdsSecurityGroup,
    });

    /**
     *
     * Secrets Manager
     *
     */
    const secretsManager = new SecretsManager(this, "SecretsManager");

    /**
     *
     * ECS on Fargate
     *
     */
    const ecs = new Ecs(this, "EcsFargate", {
      vpc,
      resourceName,
      ecrRepository: repository,
      rds,
      ecsSecurityGroup: securityGroup.ecsSecurityGroup,
      secretsManager,
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
