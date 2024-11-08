import type { IVpc } from "aws-cdk-lib/aws-ec2";
import {
  GatewayVpcEndpointAwsService,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  SubnetType,
  Vpc as _Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class Vpc extends Construct {
  public readonly value: IVpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.value = new _Vpc(this, "Vpc", {
      availabilityZones: ["ap-northeast-1a", "ap-northeast-1c"],
      // NOTE: ネットワークアドレス部:24bit, ホストアドレス部:8bit
      ipAddresses: IpAddresses.cidr("192.168.0.0/24"),
      subnetConfiguration: [
        // NOTE: 小規模なので各サブネットのcidrMaskは`/27`で十分(ネットワークアドレス部: 27bit, ホストアドレス部: 5bit)
        {
          name: "public",
          cidrMask: 27,
          subnetType: SubnetType.PUBLIC,
        },
        // NOTE: 外部との通信はALBを介して行う(NATGatewayを介さない)ので、ISOLATEDを指定(ECRとの接続はVPCエンドポイントを利用する)
        {
          name: "isolated",
          cidrMask: 27,
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    // NOTE: VPCエンドポイントを作成
    this.value.addInterfaceEndpoint("EcrEndpoint", {
      service: InterfaceVpcEndpointAwsService.ECR,
    });
    this.value.addInterfaceEndpoint("EcrDkrEndpoint", {
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });
    this.value.addInterfaceEndpoint("CwLogsEndpoint", {
      service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });
    this.value.addGatewayEndpoint("SsmEndpoint", {
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });
    this.value.addGatewayEndpoint("S3Endpoint", {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnets: this.value.isolatedSubnets,
        },
      ],
    });
  }
}
