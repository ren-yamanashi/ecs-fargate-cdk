import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { MetricAggregationType } from "aws-cdk-lib/aws-applicationautoscaling";
import {
  SubnetType,
  type ISecurityGroup,
  type IVpc,
} from "aws-cdk-lib/aws-ec2";
import type { IRepository } from "aws-cdk-lib/aws-ecr";
import {
  AwsLogDriver,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  FargateService,
  FargateTaskDefinition,
  TaskDefinitionRevision,
} from "aws-cdk-lib/aws-ecs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

import { RdsSecrets } from "./rds";

interface EcsProps {
  /**
   * ECSを作成するVPC
   */
  vpc: IVpc;
  /**
   * ECRリポジトリ
   */
  repository: IRepository;
  /**
   * ECSに関連付けるセキュリティグループ
   */
  securityGroup: ISecurityGroup;
  /**
   * RDSのシークレット
   */
  rdsSecrets: RdsSecrets;
}

export class Ecs extends Construct {
  public readonly fargateService: FargateService;

  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    // NOTE: クラスターの作成
    const cluster = new Cluster(this, "Cluster", {
      vpc: props.vpc,
    });

    // NOTE: ロググループの作成
    const logGroup = new LogGroup(this, "LogGroup", {
      logGroupName: "/ecs/cdk-training-nigg-ecs",
      removalPolicy: RemovalPolicy.DESTROY,
      retention: RetentionDays.ONE_DAY,
    });
    const logDriver = new AwsLogDriver({
      logGroup,
      streamPrefix: "container",
    });

    // NOTE: タスク定義の作成
    const taskDefinition = new FargateTaskDefinition(this, "TaskDefinition", {
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
      },
    });
    taskDefinition.addContainer("Container", {
      image: ContainerImage.fromEcrRepository(props.repository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      secrets: {
        POSTGRES_USER: props.rdsSecrets.username,
        POSTGRES_PASSWORD: props.rdsSecrets.password,
        DATABASE_HOST: props.rdsSecrets.host,
        DATABASE_PORT: props.rdsSecrets.port,
        DATABASE_NAME: props.rdsSecrets.dbname,
      },
      logging: logDriver,
    });

    // NOTE: Fargate起動タイプでサービスの作成
    this.fargateService = new FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 2,
      securityGroups: [props.securityGroup],
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_ISOLATED,
      }),
      taskDefinitionRevision: TaskDefinitionRevision.LATEST,
    });

    // NOTE: オートスケーリングのターゲット設定
    const scaling = this.fargateService.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 6,
    });

    // NOTE: CPU使用率に応じてスケールアウト・スケールイン
    scaling.scaleOnMetric("StepScaling", {
      metric: this.fargateService.metricCpuUtilization({
        period: Duration.seconds(60), // 60秒間隔でCPU使用率を取得
      }),
      scalingSteps: [
        { lower: 70, change: +1 }, // CPUの使用率が70%以上の場合にタスクを1つ増加
        { upper: 30, change: -1 }, // CPUの使用率が30%以下の場合にタスクを1つ減少
      ],
      metricAggregationType: MetricAggregationType.AVERAGE, // 平均値に基づいてスケーリングされるように設定
      cooldown: Duration.seconds(60), // スケーリングのクールダウン期間を60秒に設定
    });
  }
}
