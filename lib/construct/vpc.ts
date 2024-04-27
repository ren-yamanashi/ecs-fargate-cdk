import type { SelectedSubnets } from "aws-cdk-lib/aws-ec2";
import { GatewayVpcEndpointAwsService, InterfaceVpcEndpointAwsService, IpAddresses, SubnetType, Vpc as _Vpc } from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class Vpc extends Construct {
  // NOTE: 別スタックから参照できるようにする
  public readonly value: _Vpc;
  private readonly ecsIsolatedSubnetName: string;
  private readonly rdsIsolatedSubnetName: string;

  constructor(scope: Construct, id: string, private readonly resourceName: string) {
    super(scope, id);
    this.ecsIsolatedSubnetName = `${this.resourceName}-ecs-isolated`;
    this.rdsIsolatedSubnetName = `${this.resourceName}-rds-isolated`;

    this.value = new _Vpc(this, "Vpc", {
      vpcName: `${this.resourceName}-vpc`,
      availabilityZones: ["ap-northeast-1a", "ap-northeast-1c"],
      ipAddresses: IpAddresses.cidr("192.168.0.0/16"),
      subnetConfiguration: [
        {
          name: `${this.resourceName}-public`,
          cidrMask: 26, // 小規模なので`/26`で十分(ネットワークアドレス部: 26bit, ホストアドレス部: 6bit)
          subnetType: SubnetType.PUBLIC,
        },
        // NOTE: ECSを配置するプライベートサブネット
        //       外部との通信はALBを介して行う(NATGatewayを介さない)ので、ISOLATEDを指定(ECRとの接続はVPCエンドポイントを利用する)
        {
          name: this.ecsIsolatedSubnetName,
          cidrMask: 26,
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
        // NOTE: RDSを配置するプライベートサブネット
        {
          name: this.rdsIsolatedSubnetName,
          cidrMask: 26,
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
    this.value.addGatewayEndpoint("S3Endpoint", {
      service: GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnets: this.value.isolatedSubnets,
        },
      ],
    });
  }

  public getPublicSubnets(): SelectedSubnets {
    return this.value.selectSubnets({ subnetType: SubnetType.PUBLIC });
  }

  public getEcsIsolatedSubnets(): SelectedSubnets {
    return this.value.selectSubnets({ subnetGroupName: this.ecsIsolatedSubnetName });
  }

  public getRdsIsolatedSubnets(): SelectedSubnets {
    return this.value.selectSubnets({ subnetGroupName: this.rdsIsolatedSubnetName });
  }
}
