import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import type { Vpc } from "./vpc";

interface SecurityGroupProps {
  vpc: Vpc;
  resourceName: string;
}

export class SecurityGroup extends Construct {
  public readonly albSecurityGroup: ec2.SecurityGroup;
  public readonly ecsSecurityGroup: ec2.SecurityGroup;
  public readonly rdsSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id);
    // NOTE: ALB に関連付けるセキュリティグループ
    //       任意の IPv4 アドレスからの HTTP, HTTPS アクセスを許可
    this.albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      securityGroupName: `${props.resourceName}-alb-sg`,
      vpc: props.vpc.value,
      description: "Allow HTTP and HTTPS inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP inbound traffic");
    this.albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow HTTPS inbound traffic");

    // NOTE: ECS に関連付けるセキュリティグループ
    //      ALB からのトラフィックを許可
    this.ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSecurityGroup", {
      securityGroupName: `${props.resourceName}-ecs-sg`,
      vpc: props.vpc.value,
      description: "Allow all inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    this.ecsSecurityGroup.addIngressRule(this.albSecurityGroup, ec2.Port.tcp(80), "Allow HTTP inbound traffic");

    // NOTE: RDS に関連付けるセキュリティグループ
    //       任意の IPv4 アドレスからの PostgreSQL アクセスを許可(ポート: 5432)
    this.rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      securityGroupName: `${props.resourceName}-rds-sg`,
      vpc: props.vpc.value,
      description: "Allow PostgreSQL inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    this.rdsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), "Allow PostgreSQL inbound traffic");
  }
}
