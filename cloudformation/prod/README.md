# IAM Policies for Production Account Attached to Engineering IAM Groups

```bash
# backend-developers
aws cloudformation deploy \
--template-file backend-developers-policy.yaml \
--stack-name prod-backend-developers-policy \
--capabilities CAPABILITY_NAMED_IAM \
--tags Project=org-iam Environment=prod Owner=devops@myorg.com ManagedBy=cloudformation

# frontend-developers
aws cloudformation deploy \
--template-file frontend-developers-policy.yaml \
--stack-name prod-frontend-developers-policy \
--capabilities CAPABILITY_NAMED_IAM \
--tags Project=org-iam Environment=prod Owner=devops@myorg.com ManagedBy=cloudformation
```
