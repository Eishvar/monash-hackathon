a. Extra features/ideas:
-Q&A features
-mobile view
-Palantir/god-eyes kind of global shipping lines view of the each ships with a card containing the SL/BL details


b. Frontend stuff:
1. prompt for claude to make UI better:
Add smooth animations and micro interactions like:
   smooth hover effects   
   gentle tilt effects   
   scroll-based animations   
   animated glitch-style  
    inertia-based scroll 

2. development paths:
-dribble ui(for template) + figma(very specific edits) + vercel0(vibe edits) + cursor(no idea, yt video idea)
-lovable ui + skills + prompt loop to fix the other stuff

3. https://tweakcn.com/ <- design ur own shadcn/ui from scratch

!4. "Create a JSON profile design system that extracts visual data from these screenshots so that i can use the JSON output in Cursor to give it context on how to replicate such design systems in a consistent style. Avoid including the contents of the specific images. The output should include the design style, the structure and anything that'll help an Al replicate such designs" <- pair this prompt with a screenshot of a UI u wanna clone then paste that json file into claude code and ask it to build ur frontend but following the json file.

5. Reactbits <- make ur UI more premium

!6. install shadcn mcp server in claude code <- is it needed?
-then prompt claude code to build dashboard using shadcn blocks and shadcn mcp <- apparently output better versus just asking to use shadcn
-ask claude code to plan first
-ask it to use default shadcn styling cause u will tweak the colours/styling in tweakcn
-youtuber for this method relied on screenshot + prompt loop for each little fix in the UI which is very time inefficient, find a better way.

7. nunu ai website's card's is a good reference of a good animated card implementation but the fade out effect of the top buttons on the website isnt good.

8. display the main purpose of the project at the top of the dashboard
!-microinteractions/bulk actions
-use mobbin to find UI/UX inspritation
!-maybe include modals, toasts, back button/breadcrumb
- https://www.youtube.com/watch?v=B7k5rOgmOGY  <- refer to this vid for these tips

9. !give the user a "tutorial" kind of guide, like when u play a game for the first time, there's a helper/tooltip. there should be the option to disable this.
-mobbin might already do this
-https://www.youtube.com/watch?v=Ksx9C2-3yMo <- refer to this video

10. The landing page should have some images/theme that show/describe "shipping" 
-use relume(paid but can get 7 day free trial)
-https://www.youtube.com/watch?v=RCneB_MQ7qs <-

11. get code from ur figma design, paste in claude code and ask it to convert it and implement it to ur exisiting project??? not sure hows the best way to approach this
-u can import figma designs using MCP??

12. if u already have a ui design/component in figma tat u wanna implement in ur project UI/UX then 
i) check what library/component u are already using in place(ask claude code/antigravity to do research first)
ii) ask it to make a gameplan.md for implemnting the new design by giving it context from figma by pasting the design link from figma using mcp?
iii) the better the gameplan.md the more pixel perfect the UI/UX
iv) try ur best to extract context from design and put it to a markdown file and use the .md file as the launching off point for implmenting the UI/UX
!v) to fill in gaps, use chrome inspect element tool, look at the specific component u wanna edit, copy paste the html code to claude code and make the change


14. impecable and taste skill <- for removing the ai slop look on the frontend

15. figma mcp, !playright cli(so claude can take screenshots of the website?), awesome desgin.md

a) "Create a JSON profile design system that extracts visual data from these screenshots so that i can use the JSON output in Cursor to give it context on how to replicate such design systems in a consistent style. Avoid including the contents of the specific images. The output should include the design style, the structure and anything that'll help an Al replicate such designs" <- pair this prompt with a screenshot of a UI u wanna clone then paste that json file into claude code and ask it to build ur frontend but following the json file.

b) install shadcn mcp server in claude code <- is it needed?
-then prompt claude code to build dashboard using shadcn blocks and shadcn mcp <- apparently output better versus just asking to use shadcn
-ask claude code to plan first
-ask it to use default shadcn styling cause u will tweak the colours/styling in tweakcn
-youtuber for this method relied on screenshot + prompt loop for each little fix in the UI which is very time inefficient, find a better way.

c) -microinteractions/bulk actions
d) -maybe include modals, toasts, back button/breadcrumb
e) give the user a "tutorial" kind of guide, like when u play a game for the first time, there's a helper/tooltip. there should be the option to disable this.
f) to fill in gaps, use chrome inspect element tool, look at the specific component u wanna edit, copy paste the html code to claude code and make the change
g) playright cli(so claude can take screenshots of the website?)
