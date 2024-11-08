import {
  SecurityGroup as _SecurityGroup,
  ISecurityGroup,
  IVpc,
  Peer,
  Port,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface SecurityGroupProps {
  /**
   * セキュリティーグループを作成するVPC
   */
  vpc: IVpc;
}

export class SecurityGroup extends Construct {
  public readonly albSecurityGroup: ISecurityGroup;
  public readonly ecsSecurityGroup: ISecurityGroup;
  public readonly rdsSecurityGroup: ISecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id);
    this.albSecurityGroup = this.createAlbSecurityGroup(props.vpc);
    this.ecsSecurityGroup = this.createEcsSecurityGroup(props.vpc);
    this.rdsSecurityGroup = this.createRdsSecurityGroup(props.vpc);
  }

  /**
   * ALB に関連付けるセキュリティグループを作成する
   * - インバウンド通信: 任意の IPv4 アドレスからの HTTP, HTTPS アクセスを許可
   * - アウトバウンド通信: すべて許可
   */
  private createAlbSecurityGroup(vpc: IVpc): ISecurityGroup {
    const sg = new _SecurityGroup(this, "Alb", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(Peer.anyIpv4(), Port.tcp(80));

    return sg;
  }

  /**
   * ECS に関連付けるセキュリティグループを作成する
   * - インバウンド通信: ALB からの HTTP アクセスを許可
   * - アウトバウンド通信: すべて許可
   */
  private createEcsSecurityGroup(vpc: IVpc): ISecurityGroup {
    const sg = new _SecurityGroup(this, "Ecs", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(this.albSecurityGroup, Port.tcp(80));

    return sg;
  }

  /**
   * RDS に関連付けるセキュリティグループを作成する
   * - インバウンド通信: ECSからの MySQL アクセスを許可(ポート: 3306)
   * - アウトバウンド通信: すべて許可
   */
  private createRdsSecurityGroup(vpc: IVpc): ISecurityGroup {
    const sg = new _SecurityGroup(this, "Rds", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(this.ecsSecurityGroup, Port.tcp(3306));
    return sg;
  }
}
