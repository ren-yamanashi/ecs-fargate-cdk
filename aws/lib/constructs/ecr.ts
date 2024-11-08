import path from "node:path";

import { RemovalPolicy } from "aws-cdk-lib";
import type { IRepository } from "aws-cdk-lib/aws-ecr";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { DockerImageName, ECRDeployment } from "cdk-ecr-deployment";
import { Construct } from "constructs";

export class Ecr extends Construct {
  public readonly repository: IRepository;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.repository = new Repository(this, "Repository", {
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const image = new DockerImageAsset(this, "Image", {
      directory: path.join(__dirname, "../../../Dockerfile"),
      platform: Platform.LINUX_ARM64,
    });

    new ECRDeployment(this, "DeployDockerImage", {
      src: new DockerImageName(image.imageUri),
      dest: new DockerImageName(`${this.repository.repositoryUri}:latest`),
    });
  }
}
