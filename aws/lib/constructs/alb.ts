import {
  SubnetType,
  type ISecurityGroup,
  type IVpc,
} from "aws-cdk-lib/aws-ec2";
import type { ApplicationListener } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  Protocol,
  TargetType,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Construct } from "constructs";

interface AlbProps {
  /**
   * ALBを作成するVPC
   */
  vpc: IVpc;
  /**
   * ALBに関連付けるセキュリティグループ
   */
  securityGroup: ISecurityGroup;
}

export class Alb extends Construct {
  public readonly dnsName: string;
  public readonly listener: ApplicationListener;

  constructor(scope: Construct, id: string, props: AlbProps) {
    super(scope, id);

    // NOTE: ターゲットグループの作成
    const targetGroup = new ApplicationTargetGroup(this, "TargetGroup", {
      vpc: props.vpc,
      targetType: TargetType.IP,
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      healthCheck: {
        path: "/health",
        port: "80",
        protocol: Protocol.HTTP,
        healthyHttpCodes: "200",
      },
    });

    // NOTE: ALBの作成
    const alb = new ApplicationLoadBalancer(this, "Resource", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.securityGroup,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }),
    });

    // NOTE: リスナーの作成
    this.listener = alb.addListener("Listener", {
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    this.dnsName = alb.loadBalancerDnsName;
  }
}
