import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";

import { Alb } from "./constructs/alb";
import { Ecr } from "./constructs/ecr";
import { Ecs } from "./constructs/ecs";
import { Rds } from "./constructs/rds";
import { Vpc } from "./constructs/vpc";

export class CdkTrainingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const ecr = new Ecr(this, "Ecr");

    const vpc = new Vpc(this, "Vpc");

    const alb = new Alb(this, "Alb", {
      vpc: vpc.resource,
    });

    const rds = new Rds(this, "Rds", {
      vpc: vpc.resource,
      databaseName: "sample_database",
      username: "ren_yamanashi",
    });

    const ecs = new Ecs(this, "Ecs", {
      vpc: vpc.resource,
      repository: ecr.repository,
      connections: {
        alb: alb.connectableInstance,
        rds: rds.connectableInstance,
      },
      secrets: rds.secrets,
    });

    alb.listener.addTargets("Ecs", {
      port: 80,
      targets: [ecs.loadBalancerTarget],
      healthCheck: {
        path: "/health",
        interval: Duration.seconds(5),
        timeout: Duration.seconds(3),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 2,
      },
    });

    // NOTE: 出力としてロードバランサーのDNS名を出力
    new CfnOutput(this, "LoadBalancerDns", {
      value: alb.dnsName,
    });
  }
}