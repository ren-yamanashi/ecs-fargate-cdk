import { Construct } from "constructs";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Vpc } from "./vpc";

interface AlbProps {
  vpc: Vpc;
  resourceName: string;
  securityGroup: ec2.SecurityGroup;
}

export class Alb extends Construct {
  public readonly value: elb.ApplicationLoadBalancer;
  private readonly listener: elb.ApplicationListener;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // NOTE: ターゲットグループの作成
    const targetGroup = new elb.ApplicationTargetGroup(this, "AlbTargetGroup", {
      targetGroupName: `${props.resourceName}-alb-tg`,
      vpc: props.vpc.value,
      targetType: elb.TargetType.IP,
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
      healthCheck: {
        path: "/",
        port: "80",
        protocol: elb.Protocol.HTTP,
      },
    });

    // NOTE: ALBの作成
    this.value = new elb.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `${props.resourceName}-alb`,
      vpc: props.vpc.value,
      internetFacing: true,
      securityGroup: props.securityGroup,
      vpcSubnets: props.vpc.getPublicSubnets(),
    });

    // NOTE: リスナーの作成
    this.listener = this.value.addListener("AlbListener", {
      protocol: elb.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });
  }

  public addTargets(id: string, props: elb.AddApplicationTargetsProps) {
    this.listener.addTargets(id, props);
  }
}
