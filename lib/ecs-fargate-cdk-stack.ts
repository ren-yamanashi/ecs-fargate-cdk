import type { StackProps } from "aws-cdk-lib";
import { CfnOutput, Duration, Stack } from "aws-cdk-lib";
import type { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { ApplicationProtocol } from "aws-cdk-lib/aws-elasticloadbalancingv2";

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
      "ECRRepository",
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
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      subnetConfiguration: [
        {
          name: `${resourceName}-public`,
          cidrMask: 24,
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
      natGateways: 0,
    });

    /**
     *
     * Internet Gateway
     *
     */
    const securityGroup = new ec2.SecurityGroup(this, "SecurityGroupForIG", {
      securityGroupName: `${resourceName}-sg`,
      vpc,
      description: "Allow HTTP and HTTPS inbound traffic. Allow all outbound traffic.",
      allowAllOutbound: true, // すべてのアウトバウンドトラフィックを許可
    });
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow HTTP inbound traffic");
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "Allow HTTPS inbound traffic");

    /**
     *
     * Application Load Balancer
     *
     */
    // NOTE: ターゲットグループの作成
    const targetGroup = new elbv2.ApplicationTargetGroup(this, "AlbTargetGroup", {
      targetGroupName: `${resourceName}-tg`,
      vpc,
      targetType: elbv2.TargetType.IP,
      protocol: ApplicationProtocol.HTTP,
      port: 80,
      healthCheck: {
        path: "/",
        port: "80",
        protocol: elbv2.Protocol.HTTP,
      },
    });

    // NOTE: ALBの作成
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      loadBalancerName: `${resourceName}-alb`,
      vpc,
      internetFacing: true,
      securityGroup,
      vpcSubnets: { subnets: vpc.publicSubnets },
    });

    // NOTE: リスナーの作成
    const listener = alb.addListener("ALBListener", {
      protocol: ApplicationProtocol.HTTP,
      defaultTargetGroups: [targetGroup],
    });

    // NOTE: 出力としてロードバランサーのDNS名を出力
    new CfnOutput(this, "LoadBalancerDNS", {
      value: alb.loadBalancerDnsName,
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
    const taskDefinition = new ecs.FargateTaskDefinition(this, "ECSTaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
      },
    });
    taskDefinition.addContainer("ECSContainer", {
      image: ecs.ContainerImage.fromEcrRepository(repository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
    });

    // NOTE: Fargate起動タイプでサービスの作成
    const fargateService = new ecs.FargateService(this, "ECSFargateService", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [securityGroup],
      vpcSubnets: { subnets: vpc.publicSubnets },
    });

    // NOTE: ターゲットグループにタスクを追加
    listener.addTargets("ECS", {
      port: 80,
      targets: [fargateService],
      healthCheck: {
        path: "/",
        interval: Duration.minutes(1),
      },
    });
  }
}
