import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as logs from "aws-cdk-lib/aws-logs";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import type { Vpc } from "./vpc";

interface EcsProps {
  vpc: Vpc;
  resourceName: string;
  ecrRepository: ecr.IRepository;
  securityGroup: ec2.SecurityGroup;
  env: {
    databaseUrl: string;
  };
}

export class Ecs extends Construct {
  public readonly fargateService: ecs.FargateService;

  constructor(scope: Construct, id: string, props: EcsProps) {
    super(scope, id);

    // NOTE: クラスターの作成
    const cluster = new ecs.Cluster(this, "EcsCluster", {
      clusterName: `${props.resourceName}-cluster`,
      vpc: props.vpc.value,
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
      image: ecs.ContainerImage.fromEcrRepository(props.ecrRepository),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      environment: {
        DATABASE_URL: props.env.databaseUrl,
      },
      logging: new ecs.AwsLogDriver(
        {
          streamPrefix: "ecs-fargate",
          logRetention: logs.RetentionDays.ONE_DAY,
        },
      ),
    });

    // NOTE: Fargate起動タイプでサービスの作成
    this.fargateService = new ecs.FargateService(this, "EcsFargateService", {
      cluster,
      taskDefinition,
      desiredCount: 2,
      assignPublicIp: true,
      securityGroups: [props.securityGroup],
      vpcSubnets: props.vpc.getEcsIsolatedSubnets(),
      taskDefinitionRevision: ecs.TaskDefinitionRevision.LATEST,
    });
  }
}
