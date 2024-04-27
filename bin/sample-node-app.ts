#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import { SampleNodeAppStack } from "../lib/sample-node-app-stack";

dotenv.config({ path: ".env" });

const accountId = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

if (!accountId || !region) {
  throw new Error("Environmental variables are not set properly");
}

const app = new cdk.App();

new SampleNodeAppStack(app, "SampleNodeAppStack", {
  env: { account: accountId, region },
});
