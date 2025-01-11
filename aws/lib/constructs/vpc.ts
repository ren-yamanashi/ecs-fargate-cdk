import {
  GatewayVpcEndpointAwsService,
  IVpc,
  InterfaceVpcEndpointAwsService,
  IpAddresses,
  SubnetType,
  Vpc as _Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

import { STACK_AVAILABILITY_ZONES } from "../config";

export class Vpc extends Construct {
  public readonly resource: IVpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.resource = new _Vpc(this, "Vpc", {
      availabilityZones: Object.values(STACK_AVAILABILITY_ZONES),
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
      createInternetGateway: true,
    });

    // NOTE: VPCエンドポイントを作成
    this.resource.addInterfaceEndpoint("EcrEndpoint", {
      service: InterfaceVpcEndpointAwsService.ECR,
    });
    this.resource.addInterfaceEndpoint("EcrDkrEndpoint", {
      service: InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });
    this.resource.addInterfaceEndpoint("CwLogsEndpoint", {
      service: InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });
    this.resource.addInterfaceEndpoint("SecretsManagerEndpoint", {
      service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });
    this.resource.addGatewayEndpoint("S3Endpoint", {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnets: this.resource.isolatedSubnets,
        },
      ],
    });
  }
}
