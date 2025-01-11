import path from "node:path";

import { IgnoreMode, RemovalPolicy } from "aws-cdk-lib";
import {
  IRepository,
  Repository,
  RepositoryEncryption,
  TagMutability,
} from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import { DockerImageName, ECRDeployment } from "cdk-ecr-deployment";
import { Construct } from "constructs";

export class Ecr extends Construct {
  public readonly repository: IRepository;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.repository = new Repository(this, "Repository", {
      imageTagMutability: TagMutability.MUTABLE,
      encryption: RepositoryEncryption.AES_256,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const image = new DockerImageAsset(this, "Image", {
      directory: path.join(__dirname, "../../../"),
      platform: Platform.LINUX_ARM64,
      // NOTE: `.dockerignore`に列挙されているディレクトリ・ファイルを除外対象とする
      ignoreMode: IgnoreMode.DOCKER,
    });

    new ECRDeployment(this, "DeployDockerImage", {
      src: new DockerImageName(image.imageUri),
      dest: new DockerImageName(`${this.repository.repositoryUri}:latest`),
    });
  }
}
