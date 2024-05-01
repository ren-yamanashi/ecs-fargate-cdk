import { Construct } from "constructs";

import type { SecurityGroup, SubnetSelection, Vpc } from "aws-cdk-lib/aws-ec2";
import type { AddApplicationTargetsProps, ApplicationListener } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ApplicationLoadBalancer, ApplicationProtocol, ApplicationTargetGroup, Protocol, TargetType } from "aws-cdk-lib/aws-elasticloadbalancingv2";

interface AlbProps {
  vpc: Vpc;
  resourceName: string;
  securityGroup: SecurityGroup;
  subnets: SubnetSelection;
}

export class Alb extends Construct {
  public readonly value: ApplicationLoadBalancer;
  private readonly listener: ApplicationListener;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // NOTE: ターゲットグループの作成
    const targetGroup = new ApplicationTargetGroup(this, "AlbTargetGroup", {
      targetGroupName: `${props.resourceName}-alb-tg`,
      vpc: props.vpc,
      targetType: TargetType.IP,
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      healthCheck: {
        path: "/",
        port: "80",
        protocol: Protocol.HTTP,
      },
    });

    // NOTE: ALBの作成
    this.value = new ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `${props.resourceName}-alb`,
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.securityGroup,
      vpcSubnets: props.subnets,
    });

    // NOTE: リスナーの作成
    this.listener = this.value.addListener("AlbListener", {
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });
  }

  public addTargets(id: string, props: AddApplicationTargetsProps): void {
    this.listener.addTargets(id, props);
  }
}
