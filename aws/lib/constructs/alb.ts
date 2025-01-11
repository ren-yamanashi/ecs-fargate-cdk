import { IConnectable, SubnetType, type IVpc } from "aws-cdk-lib/aws-ec2";
import type {
  IApplicationListener,
  IApplicationLoadBalancer,
} from "aws-cdk-lib/aws-elasticloadbalancingv2";
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
  readonly vpc: IVpc;
}

export class Alb extends Construct {
  /**
   * 接続可能なALBのインスタンス
   * @example リソースをALBと接続する際には、このインスタンスを利用して以下のように接続を行う
   * ```typescript
   * // `allowDefaultPortTo`の引数には接続したいリソースを指定
   * connectableInstance.connections.allowDefaultPortTo(ecsService);
   * ```
   */
  public readonly connectableInstance: IConnectable;

  private readonly resource: IApplicationLoadBalancer;

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
    this.resource = new ApplicationLoadBalancer(this, "Resource", {
      vpc: props.vpc,
      internetFacing: true,
      vpcSubnets: props.vpc.selectSubnets({ subnetType: SubnetType.PUBLIC }),
    });

    // NOTE: リスナーの作成
    this.resource.addListener("Listener", {
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    this.connectableInstance = this.resource;
  }

  /**
   * ALBのリスナー
   */
  get listener(): IApplicationListener {
    // NOTE: リスナーはconstructor内で1つしか作成しないため、配列の一番目の要素を取得
    //       public変数には`addListener`メソッドを呼び出し可能な変数がないため、配列の要素が1つ以外の場合は考慮しない
    return this.resource.listeners[0];
  }

  /**
   * ALBのDNS名
   */
  get dnsName(): string {
    return this.resource.loadBalancerDnsName;
  }
}
