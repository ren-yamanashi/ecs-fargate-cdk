import { Construct } from "constructs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class SecretsManager extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  public getSecretValue<T extends [string, ...string[]]>(secretName: string, secretKeys: T): { [key in T[number]]: string } {
    const secret = secretsmanager.Secret.fromSecretAttributes(this, "SecretStrings", {
      // TODO: arnを環境変数から取得するようにする
      secretCompleteArn: `arn:aws:secretsmanager:<region>:<accountId>:secret:/${secretName}-<random-value>`,
    });

    return secretKeys.reduce((acc, key) => {
      const secretValue = secret.secretValueFromJson(key).unsafeUnwrap();
      if (!secretValue) {
        throw new Error(`Failed to get ${key}`);
      }

      // eslint-disable-next-line ts/prefer-ts-expect-error, ts/ban-ts-comment
      // @ts-ignore
      acc[key] = secretValue;
      return acc;
    }, {} as { [key in T[number]]: string });
  }
}
