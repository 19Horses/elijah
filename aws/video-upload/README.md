# Video uploads (S3 + CloudFront + Lambda)

Editors upload videos from the Sanity Studio's **Video** document. The file goes straight from the browser to a private S3 bucket and is served through CloudFront. Sanity only stores the S3 key and the file's details.

How an upload works:

1. The Studio's upload field (`backend/components/S3VideoInput.tsx`) sends the editor's Sanity login token, plus the file's name, type and size, to this Lambda.
2. The Lambda (`index.mjs`) asks Sanity's API who the token belongs to. It only continues for members of the project who aren't viewers. It then returns a 15-minute signed upload policy for a new key, `videos/<random id>/<filename>`.
3. The browser uploads the file directly to S3 using that policy, then saves the key on the document.
4. The frontend plays the video from `<CloudFront domain>/<key>`.

Use one AWS region for everything. These steps use **eu-west-2 (London)**.

Before you start, find the Studio's web address at [sanity.io/manage](https://www.sanity.io/manage), under the project's Studios tab (something like `https://xxxx.sanity.studio`). It's called `STUDIO_URL` below.

## 1. S3 bucket

1. Open S3 and click **Create bucket**. Give it a name (e.g. `elijah-videos`) and choose eu-west-2.
2. Under **Object Ownership**, choose **ACLs disabled (recommended)**.
3. Leave **Block all public access** ticked. Nothing should be able to read the bucket directly.
4. Leave the remaining settings as they are and click **Create bucket**.
5. Open the bucket, go to **Permissions**, find **Cross-origin resource sharing (CORS)**, click **Edit**, and paste this in (with your Studio address):

```json
[
  {
    "AllowedOrigins": ["http://localhost:3333", "STUDIO_URL"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

## 2. CloudFront

1. Open CloudFront and click **Create distribution**.
2. For **Origin domain**, pick the bucket from the dropdown.
3. For **Origin access**, choose **Origin access control settings (recommended)**, click **Create new OAC**, and keep the defaults.
4. Under **Viewer protocol policy**, choose **Redirect HTTP to HTTPS**. Set **Allowed HTTP methods** to **GET, HEAD** and **Cache policy** to **CachingOptimized**.
5. Set **Web Application Firewall** to **Do not enable**, since it costs extra. Under **Price class**, picking **Use only North America and Europe** is cheaper.
6. Create the distribution. A yellow banner will ask you to update the bucket policy: click **Copy policy**, then paste it into the bucket under **Permissions**, **Bucket policy**, **Edit**, and save.
7. Note the **Distribution domain name** (e.g. `https://d1234abcd.cloudfront.net`). This is the CDN URL.

If the create wizard didn't show some of these options, set them on the distribution's page afterwards:

- **Viewer protocol policy, allowed methods, cache policy:** open the **Behaviors** tab, tick `Default (*)`, click **Edit**, then save.
- **Origin access:** open the **Origins** tab, edit the S3 origin, select an OAC, then copy the bucket policy it offers into the bucket as in step 6.

Changes take a few minutes to roll out. The **General** tab shows "Deploying" until they're live.

### If there's no "Copy policy" option

Write the bucket policy yourself. Get the **Distribution ARN** from the distribution's **General** tab, then in S3 go to the bucket's **Permissions**, **Bucket policy**, **Edit**, and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontRead",
      "Effect": "Allow",
      "Principal": {"Service": "cloudfront.amazonaws.com"},
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
        }
      }
    }
  ]
}
```

The policy only works if the origin uses an OAC (**Origins** tab, edit the S3 origin, **Origin access**: **Origin access control settings**).

To test it, upload any file to the bucket in the S3 console and open `https://<cloudfront-domain>/<file-name>`. "Access Denied" means the policy or the OAC isn't set up.

## 3. Lambda function

1. **Build the zip** from this folder:
  ```bash
   cd aws/video-upload && npm run package
  ```
   This creates `function.zip`, which is ignored by git.
2. **Create the function.** In Lambda, click **Create function** and choose **Author from scratch**. Name it `video-upload` and pick runtime **Node.js 22.x**. For permissions, choose **Create a new role with basic Lambda permissions**.
3. Under **Additional configurations**, tick **Enable function URL** and set **Auth type** to **NONE**. The function checks the editor's Sanity login itself.
4. Also tick **Configure cross-origin resource sharing (CORS)**, and set:
  - **Allow origin:** `http://localhost:3333` and `STUDIO_URL`
  - **Allow headers:** `authorization, content-type`
  - **Allow methods:** `POST`
5. **Upload the code.** Click **Create function**. On the **Code** tab, click **Upload from**, choose **.zip file**, and upload `function.zip`. Under **Runtime settings**, check the handler is `index.handler`.
6. **Configuration** tab, **General configuration**: set the timeout to **10 seconds**.
7. **Configuration** tab, **Environment variables**: add
  - `BUCKET_NAME`: the bucket name
  - `SANITY_PROJECT_ID`: `8l62ppj0`
   - `MAX_UPLOAD_BYTES` (optional): the default is 5 GB, which is also the most S3 accepts in a single upload.
   - `BUCKET_REGION` (optional): only needed if the bucket is in a different region from the Lambda, e.g. `eu-west-2`.
8. **Configuration** tab, **Permissions**: click the role name to open it in IAM. Choose **Add permissions**, then **Create inline policy**, switch to the **JSON** editor, paste this (with the bucket name), and save:
  ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": "s3:PutObject",
         "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/videos/*"
       }
     ]
   }
  ```
9. Copy the **Function URL** from the function's overview page.
10. **Quick test:** this should return `401` with "Not signed in to Sanity…", which means the function is running and rejecting anyone who isn't logged in:
  ```bash
    curl -i -X POST <function-url>
  ```

### If the function already exists

The function URL, CORS and role options only appear in the create form. After the function is created, they're all under the **Configuration** tab's left-hand menu:

- **Function URL**: click **Create function URL**, set **Auth type** to **NONE**, expand **Additional settings**, tick **Configure cross-origin resource sharing (CORS)**, and enter the origins, headers and methods from step 4.
- **Permissions**: click the **Execution role** name to open it in IAM, then add the inline policy from step 8. On the same page, **Resource-based policy statements** should include `lambda:InvokeFunctionUrl`. The console adds it automatically for auth type NONE, and without it the URL returns `403 Forbidden`.
- **General configuration**: timeout (step 6).
- **Environment variables**: step 7.

The runtime and handler are on the **Code** tab, under **Runtime settings**.

If the curl test returns `502` or "Internal server error", the code didn't upload or the handler name is wrong. The **Monitor** tab links to the logs.

### Updating the Lambda code

After changing `index.mjs`, run `npm run package` again and upload the new `function.zip` on the function's **Code** tab.

## 4. Connect the Studio

Copy `backend/.env.example` to `backend/.env` and fill in both values:

```
SANITY_STUDIO_VIDEO_UPLOAD_URL=<function URL>
SANITY_STUDIO_VIDEO_CDN_URL=<CloudFront domain>
```

Restart `yarn start:backend`, then create a Video document and upload a short clip. Once it finishes, the preview plays it back from CloudFront.

When it works locally, deploy the Studio so the hosted version gets the field too:

```bash
yarn workspace backend deploy
```

## Troubleshooting

- **"No login token found"**: the Studio uses `auth: {loginMethod: 'token'}` (in `backend/sanity.config.ts`). Log out of the Studio and back in.
- **"Not signed in to Sanity as an editor of this project"**: the token is expired, or the user is a viewer or isn't a member of the project.
- **"Upload failed. Check the S3 bucket CORS settings."**: the Studio's address is missing from the bucket's CORS `AllowedOrigins`, or `POST` isn't allowed there.
- **The browser console shows a CORS error calling the function URL**: the Studio's address is missing from the Lambda function URL's CORS settings, or `authorization` isn't in the allowed headers.
- **"S3 rejected the upload (403)"**: the Lambda role is missing the `s3:PutObject` policy, `BUCKET_NAME` is wrong, or the upload policy expired after 15 minutes.
- **The upload works but the preview doesn't play**: check `SANITY_STUDIO_VIDEO_CDN_URL`, and that the CloudFront bucket policy was saved on the bucket. Also, iPhone HEVC `.mov` files don't play in Chrome or Firefox, so use H.264 MP4s where possible.

## Things to know

- Replacing or removing a video in Studio doesn't delete the old file from S3.
- Videos can't be added to collections or the main timeline yet. Video isn't in the allowed types in `backend/schemaTypes/collection.ts` or `mainTimelineItem.ts`, because the frontend doesn't show videos yet.
- All videos are public to anyone with the CloudFront URL. Truly private videos would need CloudFront signed URLs, created by a server-side function that checks the user has collected the item.

