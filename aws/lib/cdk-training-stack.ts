import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";

import { Alb } from "./constructs/alb";
import { Ecr } from "./constructs/ecr";
import { Ecs } from "./constructs/ecs";
import { Rds } from "./constructs/rds";
import { SecurityGroup } from "./constructs/security-group";
import { Vpc } from "./constructs/vpc";

export class CdkTrainingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ecr = new Ecr(this, "Ecr");

    const vpc = new Vpc(this, "Vpc");

    const securityGroup = new SecurityGroup(this, "SecurityGroup", {
      vpc: vpc.value,
    });

    const alb = new Alb(this, "Alb", {
      vpc: vpc.value,
      securityGroup: securityGroup.albSecurityGroup,
    });

    const rds = new Rds(this, "Rds", {
      vpc: vpc.value,
      securityGroup: securityGroup.rdsSecurityGroup,
      databaseName: "cdk_training_nigg",
      username: "nigg",
    });

    const ecs = new Ecs(this, "EcsFargate", {
      vpc: vpc.value,
      repository: ecr.repository,
      securityGroup: securityGroup.ecsSecurityGroup,
      rdsSecrets: rds.getDatabaseSecrets(),
    });

    alb.listener.addTargets("Ecs", {
      port: 80,
      targets: [ecs.fargateService],
      healthCheck: {
        path: "/health",
        interval: Duration.minutes(5),
      },
    });

    // NOTE: 出力としてロードバランサーのDNS名を出力
    new CfnOutput(this, "LoadBalancerDns", {
      value: alb.dnsName,
    });
  }
}
