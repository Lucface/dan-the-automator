# iOS Shortcut Setup

Capture anything from your iPhone/iPad with a single tap.

## Quick Setup

### 1. Create the Shortcut

1. Open the **Shortcuts** app on your iPhone/iPad
2. Tap **+** to create a new shortcut
3. Name it "Capture" or "Drop"

### 2. Add Actions

Add these actions in order:

```
1. Receive [Any] input from [Share Sheet]
   - Tap "Any" and enable all types you want to capture

2. Set Variable [CapturedContent] to [Shortcut Input]

3. If [CapturedContent] has any value
   Then:
     4. Get Contents of URL
        - URL: https://YOUR_SERVER/api/capture/quick
        - Method: POST
        - Headers:
          - Authorization: Bearer YOUR_API_SECRET
          - Content-Type: application/json
        - Request Body: JSON
          {
            "content": [CapturedContent],
            "source": "shortcut",
            "sourceDevice": "iPhone"
          }

     5. Show Notification "Captured!"

   Otherwise:
     6. Show Alert "Nothing to capture"
```

### 3. Enable Share Sheet

1. Tap the shortcut settings (i icon)
2. Enable **Show in Share Sheet**
3. Choose which content types to accept

### 4. Add to Home Screen (Optional)

1. Tap shortcut settings
2. **Add to Home Screen**
3. Choose an icon (I recommend a "+" or inbox icon)

## Advanced: Capture with Context

Create a second shortcut called "Capture with Notes":

```
1. Receive [Any] input from [Share Sheet]

2. Set Variable [CapturedContent] to [Shortcut Input]

3. Ask for Input with "Add context (optional)"
   - Store in [UserContext]

4. Get Contents of URL
   - URL: https://YOUR_SERVER/api/capture
   - Method: POST
   - Headers:
     - Authorization: Bearer YOUR_API_SECRET
     - Content-Type: application/json
   - Request Body: JSON
     {
       "content": [CapturedContent],
       "context": [UserContext],
       "source": "shortcut",
       "sourceDevice": "iPhone"
     }

5. Show Notification "Captured with notes!"
```

## Trigger Methods

### 1. Share Sheet (Recommended)
- In any app, tap Share → Capture
- Works with links, images, text, files

### 2. Home Screen Icon
- Tap the shortcut icon
- Opens camera roll or clipboard automatically

### 3. Back Tap (iPhone 8+)
- Settings → Accessibility → Touch → Back Tap
- Set Double/Triple Tap to run "Capture"
- Double-tap back of phone to capture clipboard

### 4. Action Button (iPhone 15 Pro+)
- Settings → Action Button
- Set to run "Capture" shortcut

### 5. Siri
- "Hey Siri, Capture"
- "Hey Siri, run Capture shortcut"

### 6. Widget
- Add Shortcuts widget to home screen
- Tap Capture anytime

## Shortcut JSON (Import Ready)

Copy this to a file and import via AirDrop or iCloud:

```json
{
  "WFWorkflowName": "Capture",
  "WFWorkflowIcon": {
    "WFWorkflowIconStartColor": 2071128575,
    "WFWorkflowIconGlyphNumber": 59754
  },
  "WFWorkflowTypes": ["NCWidget", "WatchKit", "ActionExtension"],
  "WFWorkflowInputContentItemClasses": [
    "WFURLContentItem",
    "WFImageContentItem",
    "WFStringContentItem",
    "WFArticleContentItem",
    "WFSafariWebPageContentItem"
  ],
  "WFWorkflowActions": [
    {
      "WFWorkflowActionIdentifier": "is.workflow.actions.setvariable",
      "WFWorkflowActionParameters": {
        "WFVariableName": "CapturedContent",
        "WFInput": {
          "Value": {
            "Type": "ExtensionInput"
          },
          "WFSerializationType": "WFTextTokenAttachment"
        }
      }
    },
    {
      "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
      "WFWorkflowActionParameters": {
        "WFURL": "https://YOUR_SERVER/api/capture/quick",
        "WFHTTPMethod": "POST",
        "WFHTTPHeaders": {
          "Value": {
            "WFDictionaryFieldValueItems": [
              {
                "WFKey": "Authorization",
                "WFValue": "Bearer YOUR_API_SECRET"
              },
              {
                "WFKey": "Content-Type",
                "WFValue": "application/json"
              }
            ]
          }
        },
        "WFHTTPBodyType": "Json",
        "WFJSONValues": {
          "Value": {
            "WFDictionaryFieldValueItems": [
              {
                "WFKey": "content",
                "WFValue": {
                  "Value": {
                    "Type": "Variable",
                    "VariableName": "CapturedContent"
                  },
                  "WFSerializationType": "WFTextTokenAttachment"
                }
              },
              {
                "WFKey": "source",
                "WFValue": "shortcut"
              }
            ]
          }
        }
      }
    },
    {
      "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
      "WFWorkflowActionParameters": {
        "WFNotificationActionBody": "Captured!"
      }
    }
  ]
}
```

## Tips

- **Clipboard Capture**: Create a shortcut that grabs clipboard content
  - Add action: "Get Clipboard"
  - Pass to the capture URL

- **Screenshot Capture**: Auto-capture screenshots
  - Create automation: "When screenshot is taken"
  - Run capture shortcut with the image

- **Voice Notes**: Capture voice memos
  - Add "Dictate Text" action before capture
  - Speak your thought, it gets transcribed and captured

## Troubleshooting

**"Couldn't connect to server"**
- Check your API server is running and accessible
- Verify the URL is correct
- Check your API_SECRET token

**"No input received"**
- Make sure the shortcut accepts the content type
- Try copying to clipboard first, then use clipboard shortcut

**Shortcut doesn't appear in Share Sheet**
- Go to shortcut settings
- Enable "Show in Share Sheet"
- Enable the specific content types
