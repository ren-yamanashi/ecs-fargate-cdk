import { Peer, Port, SecurityGroup as _SecurityGroup } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";
import type { Vpc } from "./vpc";

interface SecurityGroupProps {
  vpc: Vpc;
  resourceName: string;
}

export class SecurityGroup extends Construct {
  public readonly albSecurityGroup: _SecurityGroup;
  public readonly ecsSecurityGroup: _SecurityGroup;
  public readonly rdsSecurityGroup: _SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id);
    // NOTE: ALB に関連付けるセキュリティグループ
    //       任意の IPv4 アドレスからの HTTP, HTTPS アクセスを許可
    this.albSecurityGroup = new _SecurityGroup(this, "AlbSecurityGroup", {
      securityGroupName: `${props.resourceName}-alb-sg`,
      vpc: props.vpc.value,
      description: "Allow HTTP and HTTPS inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    this.albSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80), "Allow HTTP inbound traffic");
    this.albSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(443), "Allow HTTPS inbound traffic");

    // NOTE: ECS に関連付けるセキュリティグループ
    //      ALB からのトラフィックを許可
    this.ecsSecurityGroup = new _SecurityGroup(this, "EcsSecurityGroup", {
      securityGroupName: `${props.resourceName}-ecs-sg`,
      vpc: props.vpc.value,
      description: "Allow all inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    this.ecsSecurityGroup.addIngressRule(this.albSecurityGroup, Port.tcp(80), "Allow HTTP inbound traffic");

    // NOTE: RDS に関連付けるセキュリティグループ
    //       任意の IPv4 アドレスからの PostgreSQL アクセスを許可(ポート: 5432)
    this.rdsSecurityGroup = new _SecurityGroup(this, "RdsSecurityGroup", {
      securityGroupName: `${props.resourceName}-rds-sg`,
      vpc: props.vpc.value,
      description: "Allow PostgreSQL inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    this.rdsSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(5432), "Allow PostgreSQL inbound traffic");
  }
}
