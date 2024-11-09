import {
  SecurityGroup as _SecurityGroup,
  IVpc,
  Peer,
  Port
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface SecurityGroupProps {
  /**
   * セキュリティーグループを作成するVPC
   */
  vpc: IVpc;
}

export class SecurityGroup extends Construct {
  public readonly albSecurityGroup: _SecurityGroup;
  public readonly ecsSecurityGroup: _SecurityGroup;
  public readonly rdsSecurityGroup: _SecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id);
    this.albSecurityGroup = this.createAlbSecurityGroup(props.vpc);
    this.ecsSecurityGroup = this.createEcsSecurityGroup(props.vpc);
    this.rdsSecurityGroup = this.createRdsSecurityGroup(props.vpc);
  }

  /**
   * ALB に関連付けるセキュリティグループを作成する
   * - インバウンド通信: 任意の IPv4 アドレスからの HTTP(ポート: 80) アクセスを許可
   * - アウトバウンド通信: すべて許可
   */
  private createAlbSecurityGroup(vpc: IVpc): _SecurityGroup {
    const sg = new _SecurityGroup(this, "Alb", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(Peer.anyIpv4(), Port.tcp(80));

    return sg;
  }

  /**
   * ECS に関連付けるセキュリティグループを作成する
   * - インバウンド通信: ALB からの HTTP(ポート: 80) アクセスを許可
   * - アウトバウンド通信: すべて許可
   */
  private createEcsSecurityGroup(vpc: IVpc): _SecurityGroup {
    const sg = new _SecurityGroup(this, "Ecs", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(this.albSecurityGroup, Port.tcp(80));

    return sg;
  }

  /**
   * RDS に関連付けるセキュリティグループを作成する
   * - インバウンド通信: ECSからの PostgreSQL(ポート: 5432) アクセスを許可
   * - アウトバウンド通信: すべて許可
   */
  private createRdsSecurityGroup(vpc: IVpc): _SecurityGroup {
    const sg = new _SecurityGroup(this, "Rds", {
      vpc,
      allowAllOutbound: true,
    });
    sg.addIngressRule(this.ecsSecurityGroup, Port.tcp(5432));
    return sg;
  }
}
