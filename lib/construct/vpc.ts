import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class Vpc extends Construct {
  // NOTE: 別スタックから参照できるようにする
  public readonly value: ec2.Vpc;
  private readonly ecsIsolatedSubnetName: string;
  private readonly rdsIsolatedSubnetName: string;

  constructor(scope: Construct, id: string, private readonly resourceName: string) {
    super(scope, id);
    this.ecsIsolatedSubnetName = `${this.resourceName}-ecs-isolated`;
    this.rdsIsolatedSubnetName = `${this.resourceName}-rds-isolated`;

    this.value = new ec2.Vpc(this, "Vpc", {
      vpcName: `${this.resourceName}-vpc`,
      availabilityZones: ["ap-northeast-1a", "ap-northeast-1c"],
      ipAddresses: ec2.IpAddresses.cidr("192.168.0.0/16"),
      subnetConfiguration: [
        {
          name: `${this.resourceName}-public`,
          cidrMask: 26, // 小規模なので`/26`で十分(ネットワークアドレス部: 26bit, ホストアドレス部: 6bit)
          subnetType: ec2.SubnetType.PUBLIC,
        },
        // NOTE: ECSを配置するプライベートサブネット
        //       外部との通信はALBを介して行う(NATGatewayを介さない)ので、ISOLATEDを指定(ECRとの接続はVPCエンドポイントを利用する)
        {
          name: this.ecsIsolatedSubnetName,
          cidrMask: 26,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        // NOTE: RDSを配置するプライベートサブネット
        {
          name: this.rdsIsolatedSubnetName,
          cidrMask: 26,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    // NOTE: VPCエンドポイントを作成
    this.value.addInterfaceEndpoint("EcrEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
    });
    this.value.addInterfaceEndpoint("EcrDkrEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
    });
    this.value.addInterfaceEndpoint("CwLogsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
    });
    this.value.addGatewayEndpoint("S3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        {
          subnets: this.value.isolatedSubnets,
        },
      ],
    });
  }

  public getPublicSubnets(): ec2.SelectedSubnets {
    return this.value.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC });
  }

  public getEcsIsolatedSubnets(): ec2.SelectedSubnets {
    return this.value.selectSubnets({ subnetGroupName: this.ecsIsolatedSubnetName });
  }

  public getRdsIsolatedSubnets(): ec2.SelectedSubnets {
    return this.value.selectSubnets({ subnetGroupName: this.rdsIsolatedSubnetName });
  }
}
