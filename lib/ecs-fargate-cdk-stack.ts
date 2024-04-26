import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elb from "aws-cdk-lib/aws-elasticloadbalancingv2";

export class EcsFargateCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const resourceName = "sample-node-app";

    /**
     *
     * ECR
     *
     */
    const repository = ecr.Repository.fromRepositoryName(
      this,
      "EcrRepository",
      resourceName,
    );

    /**
     *
     * VPC
     *
     */
    const vpc = new ec2.Vpc(this, "Vpc", {
      vpcName: `${resourceName}-vpc`,
      maxAzs: 2,
      ipAddresses: ec2.IpAddresses.cidr("192.168.0.0/16"),
      subnetConfiguration: [
        // NOTE: ALBを配置するサブネット
        {
          name: `${resourceName}-public`,
          cidrMask: 26, // 小規模なので`/26`で十分(ネットワークアドレス部: 26bit, ホストアドレス部: 6bit)
          subnetType: ec2.SubnetType.PUBLIC,
        },
        // NOTE: ECSを配置するサブネット 外部との通信はALBを介して行う(NATGatewayを介さない)ので、ISOLATEDを指定
        {
          name: `${resourceName}-isolated`,
          cidrMask: 26,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        // NOTE: RDSを配置するサブネット
        {
          name: `${resourceName}-isolated-2`,
          cidrMask: 26,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });
    const albPublicSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC });
    const ecsIsolatedSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED, subnetGroupName: `${resourceName}-isolated` });
    const rdsIsolatedSubnets = vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED, subnetGroupName: `${resourceName}-isolated-2` });

    /**
     *
     * Security Group
     *
     */
    // NOTE: ALB に関連付けるセキュリティグループ
    //       任意の IPv4 アドレスからの HTTP, HTTPS アクセスを許可
    const albSecurityGroup = new ec2.SecurityGroup(this, "AlbSecurityGroup", {
      securityGroupName: `${resourceName}-alb-sg`,
      vpc,
      description: "Allow HTTP and HTTPS inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP inbound traffic");
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow HTTPS inbound traffic");

    // NOTE: ECS に関連付けるセキュリティグループ
    //      ALB からのトラフィックを許可
    const ecsSecurityGroup = new ec2.SecurityGroup(this, "EcsSecurityGroup", {
      securityGroupName: `${resourceName}-ecs-sg`,
      vpc,
      description: "Allow all inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    ecsSecurityGroup.addIngressRule(albSecurityGroup, ec2.Port.tcp(80), "Allow HTTP inbound traffic");

    // NOTE: RDS に関連付けるセキュリティグループ
    //       任意の IPv4 アドレスからの PostgreSQL アクセスを許可(ポート: 5432)
    const rdsSecurityGroup = new ec2.SecurityGroup(this, "RdsSecurityGroup", {
      securityGroupName: `${resourceName}-rds-sg`,
      vpc,
      description: "Allow PostgreSQL inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    rdsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(5432), "Allow PostgreSQL inbound traffic");

    /**
     *
     * Application Load Balancer
     *
     */
    // NOTE: ターゲットグループの作成
    const targetGroup = new elb.ApplicationTargetGroup(this, "AlbTargetGroup", {
      targetGroupName: `${resourceName}-alb-tg`,
      vpc,
      targetType: elb.TargetType.IP,
      protocol: elb.ApplicationProtocol.HTTP,
      port: 80,
      healthCheck: {
        path: "/",
        port: "80",
        protocol: elb.Protocol.HTTP,
      },
    });

    // NOTE: ALBの作成
    const alb = new elb.ApplicationLoadBalancer(this, "Alb", {
      loadBalancerName: `${resourceName}-alb`,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: albPublicSubnets,
    });

    // NOTE: リスナーの作成
    const listener = alb.addListener("AlbListener", {
      protocol: elb.ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    // NOTE: 出力としてロードバランサーのDNS名を出力
    new CfnOutput(this, "LoadBalancerDns", {
      value: alb.loadBalancerDnsName,
    });

    /**
     *
     * RDS
     *
     */
    const dbUser = process.env.DATABASE_UER ?? "";
    const dbName = process.env.DATABASE_NAME ?? "";
    const dbPassword = process.env.DATABASE_PASSWORD ?? "";
    const dbHost = process.env.DATABASE_HOST ?? "";
    const dbPort = 5432;
    const databaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;

    const rdsCredentials = rds.Credentials.fromGeneratedSecret(dbUser, {
      secretName: "/cdk-test/rds/",
    });

    new rds.DatabaseCluster(this, "RdsCluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_15_5,
      }),
      writer: rds.ClusterInstance.provisioned("Instance1", {
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T3,
          ec2.InstanceSize.MEDIUM,
        ),
        publiclyAccessible: false,
        instanceIdentifier: "db-instance1",
      }),
      credentials: rdsCredentials,
      defaultDatabaseName: dbName,
      vpc,
      vpcSubnets: rdsIsolatedSubnets,
      networkType: rds.NetworkType.IPV4,
      securityGroups: [rdsSecurityGroup],
    });

    /**
     *
     * ECS on Fargate
     *
     */
    // NOTE: クラスターの作成
    const cluster = new ecs.Cluster(this, "EcsCluster", {
      clusterName: `${resourceName}-cluster`,
      vpc,
    });

    // NOTE: タスク定義の作成
    const taskDefinition = new ecs.FargateTaskDefinition(this, "EcsTaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });
    taskDefinition.addContainer("EcsContainer", {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      environment: {
        DATABASE_URL: databaseUrl,
      },
      logging: new ecs.AwsLogDriver(
        {
          streamPrefix: "ecs-fargate",
          logRetention: logs.RetentionDays.ONE_DAY,
        },
      ),
    });

    // NOTE: Fargate起動タイプでサービスの作成
    const fargateService = new ecs.FargateService(this, "EcsFargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [albSecurityGroup],
      vpcSubnets: ecsIsolatedSubnets,
    });

    // NOTE: ターゲットグループにタスクを追加
    listener.addTargets("Ecs", {
      port: 80,
      targets: [fargateService],
      healthCheck: {
        path: "/",
        interval: Duration.minutes(1),
      },
    });
  }
}
