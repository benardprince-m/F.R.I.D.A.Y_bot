# FRIDAY Amazon Bedrock Provider

Official FRIDAY provider plugin for Amazon Bedrock. It adds Bedrock model discovery, text generation, embeddings, and guardrail-aware provider routing for agents that use AWS-hosted models.

Install from FRIDAY:

```bash
openclaw plugins install @openclaw/amazon-bedrock-provider
```

Configure AWS credentials and region through your normal FRIDAY credential/profile setup, then select Bedrock models with the `amazon-bedrock/...` provider prefix.
